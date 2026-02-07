/**
 * OrgoAdapter
 * Wraps the Samantha OrgoClient for JARVIS SDK
 * Provides VM lifecycle management and command execution
 */

const ORGO_API_BASE = 'https://www.orgo.ai/api';

export interface OrgoComputer {
  id: string;
  name: string;
  project_name: string;
  os: string;
  ram: number;
  cpu: number;
  status: string;
  url: string;
  created_at: string;
}

export interface OrgoProject {
  id: string;
  name: string;
}

export interface CreateComputerOptions {
  os?: 'linux' | 'windows';
  ram?: 1 | 2 | 4 | 8 | 16 | 32 | 64;
  cpu?: 1 | 2 | 4 | 8 | 16;
}

export interface CommandResult {
  output: string;
  exitCode: number;
  success: boolean;
}

export interface ScreenshotResult {
  image: string;
  format: 'base64';
}

/**
 * OrgoAdapter wraps Orgo API for VM management
 * Based on existing Samantha OrgoClient
 */
export class OrgoAdapter {
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, options?: { timeoutMs?: number }) {
    this.apiKey = apiKey;
    this.timeoutMs = options?.timeoutMs ?? 60000;
  }

  /**
   * Make API request to Orgo
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${ORGO_API_BASE}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Orgo API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      try {
        return JSON.parse(responseText);
      } catch {
        return responseText as T;
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(
            `Request to Orgo API timed out after ${this.timeoutMs}ms`
          );
        }
      }
      throw error;
    }
  }

  // ==================== Project Operations ====================

  /**
   * List all projects
   */
  async listProjects(): Promise<OrgoProject[]> {
    const response = await this.request<{ projects: OrgoProject[] }>(
      '/projects'
    );
    return response.projects || [];
  }

  /**
   * Get or create a project by name
   */
  async getOrCreateProject(name: string): Promise<OrgoProject> {
    const projects = await this.listProjects();
    const existing = projects.find((p) => p.name === name);
    if (existing) {
      return existing;
    }
    // Project will be created when we create the first computer
    return { id: '', name };
  }

  // ==================== Computer Operations ====================

  /**
   * Create a new computer (VM)
   * 
   * Note: For automatic duplicate name handling, use createComputerWithUniqueName instead
   */
  async createComputer(
    projectId: string,
    name: string,
    options: CreateComputerOptions = {}
  ): Promise<OrgoComputer> {
    return this.request<OrgoComputer>('/computers', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        name,
        os: options.os || 'linux',
        ram: options.ram || 4,
        cpu: options.cpu || 2,
      }),
    });
  }

  /**
   * Create a new computer with automatic duplicate name handling
   * If a duplicate name error occurs, it will automatically retry with a unique name
   */
  async createComputerWithUniqueName(
    projectId: string,
    projectName: string | undefined,
    computerName: string,
    options: CreateComputerOptions = {}
  ): Promise<OrgoComputer> {
    // First, ensure the name is unique
    const uniqueName = await this.ensureUniqueComputerName(projectId, projectName, computerName);
    
    try {
      return await this.createComputer(projectId, uniqueName, options);
    } catch (error: unknown) {
      // If we still get a duplicate error (race condition), retry with a new unique name
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('duplicate key') ||
        errorMessage.includes('desktops_project_name_unique') ||
        errorMessage.includes('already exists')
      ) {
        console.log(`[OrgoAdapter] Duplicate name error detected, generating new unique name...`);
        // Generate a new unique name with timestamp to avoid race conditions
        const timestamp = Date.now();
        const baseName = uniqueName.substring(0, 50); // Leave room for timestamp
        const newUniqueName = await this.ensureUniqueComputerName(
          projectId,
          projectName,
          `${baseName}-${timestamp}`
        );
        return await this.createComputer(projectId, newUniqueName, options);
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get computer details by ID
   */
  async getComputer(computerId: string): Promise<OrgoComputer> {
    return this.request<OrgoComputer>(`/computers/${computerId}`);
  }

  /**
   * List all computers in a project
   */
  async listComputers(projectName: string): Promise<OrgoComputer[]> {
    const response = await this.request<{ computers: OrgoComputer[] }>(
      `/projects/${encodeURIComponent(projectName)}/computers`
    );
    return response.computers || [];
  }

  /**
   * Get project name from project ID
   * If projectId is empty, returns the provided projectName as fallback
   */
  private async getProjectName(projectId: string, projectName?: string): Promise<string> {
    if (!projectId && projectName) {
      return projectName;
    }
    if (!projectId) {
      throw new Error('Either projectId or projectName must be provided');
    }
    
    // List all projects and find the one with matching ID
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      return project.name;
    }
    
    // If not found and projectName was provided, use it as fallback
    if (projectName) {
      return projectName;
    }
    
    throw new Error(`Project with ID ${projectId} not found`);
  }

  /**
   * Ensure a computer name is unique within a project
   * Checks existing computers and appends a number suffix if needed
   * @param projectId - The project ID (can be empty if projectName is provided)
   * @param projectName - The project name (used if projectId is empty or to list computers)
   * @param desiredName - The desired computer name
   * @returns A unique computer name
   */
  async ensureUniqueComputerName(
    projectId: string,
    projectName: string | undefined,
    desiredName: string
  ): Promise<string> {
    try {
      // Get the project name (needed to list computers)
      const nameToUse = await this.getProjectName(projectId, projectName);
      
      // List existing computers in the project
      const existingComputers = await this.listComputers(nameToUse);
      const existingNames = new Set(existingComputers.map((c) => c.name.toLowerCase()));
      
      // If the desired name is already unique, return it
      if (!existingNames.has(desiredName.toLowerCase())) {
        return desiredName;
      }
      
      // Generate a unique name by appending a number
      let counter = 1;
      let uniqueName = `${desiredName}-${counter}`;
      
      // Ensure the name doesn't exceed length limits
      const maxBaseLength = 63 - 5; // Leave room for "-123" suffix
      const baseName = desiredName.substring(0, maxBaseLength);
      
      while (existingNames.has(uniqueName.toLowerCase()) && counter < 1000) {
        counter++;
        uniqueName = `${baseName}-${counter}`;
      }
      
      if (counter >= 1000) {
        // Fallback: append timestamp to ensure uniqueness
        uniqueName = `${baseName}-${Date.now()}`;
      }
      
      console.log(`[OrgoAdapter] Name "${desiredName}" already exists in project, using unique name: "${uniqueName}"`);
      return uniqueName;
    } catch (error: unknown) {
      // If we can't list computers (e.g., project doesn't exist yet), 
      // return the desired name and let createComputer handle the error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[OrgoAdapter] Could not verify name uniqueness: ${errorMessage}, using desired name: "${desiredName}"`);
      return desiredName;
    }
  }

  /**
   * Start a computer
   */
  async startComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/start`, { method: 'POST' });
  }

  /**
   * Stop a computer
   */
  async stopComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/stop`, { method: 'POST' });
  }

  /**
   * Restart a computer
   */
  async restartComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/restart`, { method: 'POST' });
  }

  /**
   * Delete a computer
   */
  async deleteComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}`, { method: 'DELETE' });
  }

  /**
   * Wait for computer to be ready
   */
  async waitForReady(
    computerId: string,
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<OrgoComputer> {
    for (let i = 0; i < maxAttempts; i++) {
      const computer = await this.getComputer(computerId);
      if (computer.status === 'running') {
        return computer;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Computer did not become ready in time');
  }

  // ==================== Command Execution ====================

  /**
   * Execute a bash command on the computer
   */
  async bash(computerId: string, command: string): Promise<CommandResult> {
    const result = await this.request<{ output: string; exit_code: number }>(
      `/computers/${computerId}/bash`,
      {
        method: 'POST',
        body: JSON.stringify({ command }),
      }
    );
    return {
      output: result.output,
      exitCode: result.exit_code,
      success: result.exit_code === 0,
    };
  }

  /**
   * Execute Python code on the computer
   */
  async exec(computerId: string, code: string): Promise<{ output: string }> {
    return this.request(`/computers/${computerId}/exec`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Take a screenshot of the computer
   */
  async screenshot(computerId: string): Promise<ScreenshotResult> {
    const result = await this.request<{ image: string }>(
      `/computers/${computerId}/screenshot`
    );
    return {
      image: result.image,
      format: 'base64',
    };
  }

  // ==================== Utility Methods ====================

  /**
   * Execute command with retries
   */
  async bashWithRetry(
    computerId: string,
    command: string,
    maxRetries = 3,
    retryDelayMs = 2000
  ): Promise<CommandResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.bash(computerId, command);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const message = lastError.message;

        // Retry on transient errors
        if (
          attempt < maxRetries &&
          (message.includes('502') ||
            message.includes('Failed to execute') ||
            message.includes('ECONNREFUSED'))
        ) {
          const waitTime = retryDelayMs * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Command failed');
  }

  /**
   * Check if computer is responsive
   */
  async isResponsive(computerId: string): Promise<boolean> {
    try {
      const result = await this.bash(computerId, 'echo "ping"');
      return result.success && result.output.includes('ping');
    } catch {
      return false;
    }
  }
}

/**
 * Generate a random computer name
 */
export function generateComputerName(): string {
  const adjectives = [
    'swift',
    'bright',
    'calm',
    'bold',
    'keen',
    'wise',
    'warm',
    'cool',
  ];
  const nouns = ['fox', 'owl', 'wolf', 'hawk', 'bear', 'lion', 'deer', 'crow'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}-${noun}-${num}`;
}
