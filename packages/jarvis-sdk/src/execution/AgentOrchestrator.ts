/**
 * AgentOrchestrator
 * Multi-agent coordination and fleet management
 */

import type {
  Agent,
  AgentStatus,
  Task,
  DeployAgentOptions,
  AgentConfig,
  AgentCapabilities,
  JarvisEvent,
  JarvisEventHandler,
} from '../types';
import { OrgoAdapter, generateComputerName } from '../adapters/OrgoAdapter';
import { GitHubAdapter } from '../adapters/GitHubAdapter';
import { VMSetupAdapter } from '../adapters/VMSetupAdapter';
import { TaskQueue } from './TaskQueue';
import { nanoid } from 'nanoid';

export interface OrchestratorConfig {
  orgoApiKey: string;
  githubAccessToken: string;
  maxAgents?: number;
  projectName?: string;
  defaultAgentConfig?: Partial<AgentConfig>;
}

interface ManagedAgent extends Agent {
  queue: TaskQueue;
  lastHeartbeat?: Date;
}

/**
 * AgentOrchestrator manages multiple agents
 */
export class AgentOrchestrator {
  private orgo: OrgoAdapter;
  private github: GitHubAdapter;
  private agents: Map<string, ManagedAgent> = new Map();
  private maxAgents: number;
  private projectName: string;
  private defaultConfig: Partial<AgentConfig>;
  private eventHandlers: Map<string, JarvisEventHandler[]> = new Map();

  constructor(config: OrchestratorConfig) {
    this.orgo = new OrgoAdapter(config.orgoApiKey);
    this.github = new GitHubAdapter(config.githubAccessToken);
    this.maxAgents = config.maxAgents ?? 10;
    this.projectName = config.projectName ?? 'JARVIS Agents';
    this.defaultConfig = config.defaultAgentConfig ?? {};
  }

  // ==================== Agent Lifecycle ====================

  /**
   * Deploy a new agent
   */
  async deployAgent(options: DeployAgentOptions): Promise<Agent> {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent limit reached (${this.maxAgents})`);
    }

    const agentId = nanoid();
    const config: AgentConfig = {
      ram: 4,
      cpu: 2,
      os: 'linux',
      heartbeatIntervalMinutes: 30,
      maxConcurrentTasks: 4,
      ...this.defaultConfig,
      ...options.config,
    };

    const capabilities: AgentCapabilities = {
      canExecuteBash: true,
      canAccessInternet: true,
      canAccessFiles: true,
      canSendMessages: true,
      ...options.capabilities,
    };

    // Create agent record
    const agent: ManagedAgent = {
      id: agentId,
      tenantId: options.tenantId,
      name: options.name,
      computerId: '', // Will be set after VM creation
      vaultRepoName: '', // Will be set after repo creation
      status: 'provisioning',
      capabilities,
      config,
      createdAt: new Date(),
      updatedAt: new Date(),
      queue: new TaskQueue({ maxConcurrent: config.maxConcurrentTasks }),
    };

    this.agents.set(agentId, agent);
    this.emitEvent('agent.deployed', agent);

    try {
      // Get or create project
      const project = await this.orgo.getOrCreateProject(this.projectName);

      // Create VM with automatic unique name handling
      const desiredComputerName = generateComputerName();
      const computer = await this.orgo.createComputerWithUniqueName(
        project.id,
        project.name,
        desiredComputerName,
        {
          os: config.os,
          ram: config.ram,
          cpu: config.cpu,
        }
      );

      agent.computerId = computer.id;
      agent.status = 'starting';
      agent.updatedAt = new Date();

      // Wait for VM to be ready
      await this.orgo.waitForReady(computer.id);

      // Create vault repository
      const vaultRepoName = `jarvis-vault-${options.name.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`;
      const vaultRepo = await this.github.createVaultRepo(vaultRepoName);
      agent.vaultRepoName = vaultRepo.name;

      // Get GitHub user for setup
      const githubUser = await this.github.getUser();

      // Set up VM
      const vmSetup = new VMSetupAdapter(this.orgo, computer.id, {
        onProgress: (progress) => {
          // Could emit progress events here

        },
      });

      // Generate SSH key and add as deploy key
      const { publicKey, success: sshOk } = await vmSetup.generateSSHKey();
      if (!sshOk) {
        throw new Error('Failed to generate SSH key');
      }

      await this.github.createDeployKey(vaultRepoName, publicKey);

      // Configure Git and clone vault
      await vmSetup.configureGit(githubUser.login, githubUser.email || `${githubUser.login}@users.noreply.github.com`);
      await vmSetup.cloneVaultRepo(vaultRepo.sshUrl);
      await vmSetup.setupGitSync();

      agent.status = 'running';
      agent.updatedAt = new Date();
      agent.lastHeartbeat = new Date();

      this.emitEvent('agent.started', agent);

      return this.toPublicAgent(agent);
    } catch (error) {
      agent.status = 'failed';
      agent.updatedAt = new Date();
      this.emitEvent('agent.failed', agent);
      throw error;
    }
  }

  /**
   * Start a stopped agent
   */
  async startAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.status === 'running') {
      return this.toPublicAgent(agent);
    }

    await this.orgo.startComputer(agent.computerId);
    await this.orgo.waitForReady(agent.computerId);

    agent.status = 'running';
    agent.updatedAt = new Date();
    agent.lastHeartbeat = new Date();

    this.emitEvent('agent.started', agent);

    return this.toPublicAgent(agent);
  }

  /**
   * Stop an agent
   */
  async stopAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    await this.orgo.stopComputer(agent.computerId);

    agent.status = 'stopped';
    agent.updatedAt = new Date();

    this.emitEvent('agent.stopped', agent);

    return this.toPublicAgent(agent);
  }

  /**
   * Restart an agent
   */
  async restartAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    await this.orgo.restartComputer(agent.computerId);
    await this.orgo.waitForReady(agent.computerId);

    agent.status = 'running';
    agent.updatedAt = new Date();
    agent.lastHeartbeat = new Date();

    return this.toPublicAgent(agent);
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Stop and delete VM
    try {
      await this.orgo.deleteComputer(agent.computerId);
    } catch (error) {
      // Log but continue

    }

    this.agents.delete(agentId);
  }

  // ==================== Agent Queries ====================

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | null {
    const agent = this.agents.get(agentId);
    return agent ? this.toPublicAgent(agent) : null;
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values()).map((a) => this.toPublicAgent(a));
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentStatus): Agent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === status)
      .map((a) => this.toPublicAgent(a));
  }

  /**
   * Get agents by tenant
   */
  getAgentsByTenant(tenantId: string): Agent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.tenantId === tenantId)
      .map((a) => this.toPublicAgent(a));
  }

  /**
   * Find available agent for task
   */
  findAvailableAgent(tenantId?: string): Agent | null {
    for (const agent of this.agents.values()) {
      if (agent.status !== 'running') continue;
      if (tenantId && agent.tenantId !== tenantId) continue;

      const queueStatus = agent.queue.status();
      if (queueStatus.processing < queueStatus.maxConcurrent) {
        return this.toPublicAgent(agent);
      }
    }
    return null;
  }

  // ==================== Task Operations ====================

  /**
   * Submit a task to an agent
   */
  async submitTask(task: Task, agentId?: string): Promise<Task> {
    let targetAgent: ManagedAgent | undefined;

    if (agentId) {
      targetAgent = this.agents.get(agentId);
      if (!targetAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
    } else {
      // Find available agent
      for (const agent of this.agents.values()) {
        if (agent.status === 'running') {
          const queueStatus = agent.queue.status();
          if (queueStatus.processing < queueStatus.maxConcurrent) {
            targetAgent = agent;
            break;
          }
        }
      }
    }

    if (!targetAgent) {
      throw new Error('No available agents');
    }

    task.agentId = targetAgent.id;
    const enqueued = targetAgent.queue.enqueue(task);

    if (!enqueued) {
      throw new Error('Task queue is full');
    }

    this.emitEvent('task.created', task);

    return task;
  }

  /**
   * Get task from agent queue
   */
  getTask(agentId: string, taskId: string): Task | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return agent.queue.get(taskId);
  }

  /**
   * Cancel a task
   */
  cancelTask(agentId: string, taskId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    return agent.queue.cancel(taskId);
  }

  /**
   * Get queue status for an agent
   */
  getQueueStatus(agentId: string): {
    queued: number;
    processing: number;
    maxSize: number;
    maxConcurrent: number;
  } | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return agent.queue.status();
  }

  // ==================== Command Execution ====================

  /**
   * Execute a command on an agent
   */
  async executeCommand(
    agentId: string,
    command: string
  ): Promise<{ output: string; success: boolean }> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.status !== 'running') {
      throw new Error(`Agent is not running: ${agent.status}`);
    }

    if (!agent.capabilities.canExecuteBash) {
      throw new Error('Agent does not have bash execution capability');
    }

    const result = await this.orgo.bash(agent.computerId, command);
    return {
      output: result.output,
      success: result.success,
    };
  }

  /**
   * Take a screenshot of an agent's display
   */
  async screenshot(agentId: string): Promise<{ image: string }> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const result = await this.orgo.screenshot(agent.computerId);
    return { image: result.image };
  }

  // ==================== Health & Monitoring ====================

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = new Date();
    }
  }

  /**
   * Check agent health
   */
  async checkHealth(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    try {
      const responsive = await this.orgo.isResponsive(agent.computerId);
      if (responsive) {
        agent.lastHeartbeat = new Date();
      }
      return responsive;
    } catch {
      return false;
    }
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    totalAgents: number;
    runningAgents: number;
    stoppedAgents: number;
    failedAgents: number;
    maxAgents: number;
  } {
    const agents = Array.from(this.agents.values());
    return {
      totalAgents: agents.length,
      runningAgents: agents.filter((a) => a.status === 'running').length,
      stoppedAgents: agents.filter((a) => a.status === 'stopped').length,
      failedAgents: agents.filter((a) => a.status === 'failed').length,
      maxAgents: this.maxAgents,
    };
  }

  // ==================== Events ====================

  /**
   * Subscribe to events
   */
  on(eventType: string, handler: JarvisEventHandler): void {
    const handlers = this.eventHandlers.get(eventType) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: string, handler: JarvisEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  private emitEvent(
    type: string,
    payload: Record<string, unknown> | ManagedAgent | Task
  ): void {
    const event: JarvisEvent = {
      id: nanoid(),
      type: type as JarvisEvent['type'],
      timestamp: new Date(),
      payload: payload as Record<string, unknown>,
      source: {
        type: 'agent',
        id: (payload as { id?: string }).id ?? 'unknown',
      },
    };

    // Call specific handlers
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {

        }
      }
    }

    // Call wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (error) {

        }
      }
    }
  }

  // ==================== Helpers ====================

  /**
   * Convert internal agent to public agent
   */
  private toPublicAgent(agent: ManagedAgent): Agent {
    const { queue, lastHeartbeat, ...publicAgent } = agent;
    return publicAgent;
  }
}
