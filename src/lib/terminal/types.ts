/**
 * Terminal Provider Interface
 * 
 * This provides an abstraction layer for different terminal backends:
 * - AWS EC2 (SSH)
 * - Orgo VMs (SSH or API)
 * - Docker containers
 * - Local processes
 * - etc.
 */

export interface TerminalConfig {
  /** Unique session ID */
  sessionId: string
  /** Provider type (aws, orgo, docker, local) */
  provider: 'aws' | 'orgo' | 'docker' | 'local'
  /** Terminal dimensions */
  cols?: number
  rows?: number
}

export interface SSHConfig extends TerminalConfig {
  provider: 'aws' | 'orgo'
  /** SSH host (IP or hostname) */
  host: string
  /** SSH port (default: 22) */
  port?: number
  /** SSH username */
  username: string
  /** SSH private key (PEM format) */
  privateKey: string
}

export interface TerminalOutput {
  /** Output type */
  type: 'stdout' | 'stderr' | 'system'
  /** Output data */
  data: string
  /** Timestamp */
  timestamp: number
}

export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean
  /** Exit code (if available) */
  exitCode?: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Error message (if failed) */
  error?: string
}

/**
 * Terminal Provider Interface
 * 
 * Implementations should handle:
 * - Connection management
 * - Command execution
 * - Output streaming
 * - Session cleanup
 */
export interface ITerminalProvider {
  /** Provider identifier */
  readonly provider: string
  
  /** Check if the provider is connected */
  isConnected(): boolean
  
  /** Connect to the terminal backend */
  connect(): Promise<boolean>
  
  /** Disconnect from the terminal backend */
  disconnect(): Promise<void>
  
  /** Execute a command and return the result */
  execute(command: string): Promise<CommandResult>
  
  /** Execute a command with streaming output */
  executeStream(
    command: string,
    onOutput: (output: TerminalOutput) => void
  ): Promise<CommandResult>
  
  /** Send input to an interactive session (for PTY support) */
  sendInput?(input: string): Promise<void>
  
  /** Resize the terminal (for PTY support) */
  resize?(cols: number, rows: number): Promise<void>
}

/**
 * Terminal Session Manager
 * 
 * Manages multiple terminal sessions across different providers
 */
export interface ITerminalSessionManager {
  /** Add an existing provider as a session */
  addSession(sessionId: string, provider: ITerminalProvider): void
  
  /** Create a new terminal session */
  createSession(config: TerminalConfig | SSHConfig): Promise<string>
  
  /** Get an existing session */
  getSession(sessionId: string): ITerminalProvider | undefined
  
  /** Close a session */
  closeSession(sessionId: string): Promise<void>
  
  /** Close all sessions */
  closeAllSessions(): Promise<void>
  
  /** List active sessions */
  listSessions(): string[]
}
