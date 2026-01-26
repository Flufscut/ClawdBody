/**
 * SSH Terminal Provider
 * 
 * Provides terminal access to remote machines via SSH.
 * Works with AWS EC2, Orgo VMs, or any SSH-accessible host.
 */

import { Client, ClientChannel } from 'ssh2'
import type { 
  ITerminalProvider, 
  SSHConfig, 
  CommandResult, 
  TerminalOutput 
} from './types'

export class SSHTerminalProvider implements ITerminalProvider {
  readonly provider: string
  private client: Client | null = null
  private shell: ClientChannel | null = null
  private config: SSHConfig
  private connected: boolean = false
  private outputBuffer: string = ''
  private outputCallbacks: ((output: TerminalOutput) => void)[] = []

  constructor(config: SSHConfig) {
    this.config = config
    this.provider = config.provider
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async connect(): Promise<boolean> {
    if (this.connected) {
      return true
    }

    return new Promise((resolve) => {
      this.client = new Client()

      this.client.on('ready', () => {
        console.log(`[SSH Terminal] Connected to ${this.config.host}`)
        this.connected = true
        resolve(true)
      })

      this.client.on('error', (err) => {
        console.error(`[SSH Terminal] Connection error:`, err.message)
        this.connected = false
        resolve(false)
      })

      this.client.on('close', () => {
        console.log(`[SSH Terminal] Connection closed`)
        this.connected = false
        this.shell = null
      })

      try {
        this.client.connect({
          host: this.config.host,
          port: this.config.port || 22,
          username: this.config.username,
          privateKey: this.config.privateKey,
          readyTimeout: 30000,
          keepaliveInterval: 10000,
        })
      } catch (error) {
        console.error(`[SSH Terminal] Failed to initiate connection:`, error)
        resolve(false)
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.shell) {
      this.shell.end()
      this.shell = null
    }
    if (this.client) {
      this.client.end()
      this.client = null
    }
    this.connected = false
    this.outputCallbacks = []
  }

  async execute(command: string): Promise<CommandResult> {
    if (!this.client || !this.connected) {
      const connected = await this.connect()
      if (!connected) {
        return {
          success: false,
          stdout: '',
          stderr: '',
          error: 'Failed to connect to SSH host',
        }
      }
    }

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''

      this.client!.exec(command, (err, stream) => {
        if (err) {
          resolve({
            success: false,
            stdout: '',
            stderr: '',
            error: err.message,
          })
          return
        }

        stream.on('close', (code: number) => {
          resolve({
            success: code === 0,
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          })
        })

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      })
    })
  }

  async executeStream(
    command: string,
    onOutput: (output: TerminalOutput) => void
  ): Promise<CommandResult> {
    if (!this.client || !this.connected) {
      const connected = await this.connect()
      if (!connected) {
        onOutput({
          type: 'system',
          data: 'Failed to connect to SSH host\r\n',
          timestamp: Date.now(),
        })
        return {
          success: false,
          stdout: '',
          stderr: '',
          error: 'Failed to connect to SSH host',
        }
      }
    }

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''

      this.client!.exec(command, { pty: true }, (err, stream) => {
        if (err) {
          onOutput({
            type: 'system',
            data: `Error: ${err.message}\r\n`,
            timestamp: Date.now(),
          })
          resolve({
            success: false,
            stdout: '',
            stderr: '',
            error: err.message,
          })
          return
        }

        stream.on('close', (code: number) => {
          resolve({
            success: code === 0,
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          })
        })

        stream.on('data', (data: Buffer) => {
          const str = data.toString()
          stdout += str
          onOutput({
            type: 'stdout',
            data: str,
            timestamp: Date.now(),
          })
        })

        stream.stderr.on('data', (data: Buffer) => {
          const str = data.toString()
          stderr += str
          onOutput({
            type: 'stderr',
            data: str,
            timestamp: Date.now(),
          })
        })
      })
    })
  }

  /**
   * Start an interactive shell session
   */
  async startShell(
    onOutput: (output: TerminalOutput) => void,
    cols: number = 80,
    rows: number = 24
  ): Promise<boolean> {
    if (!this.client || !this.connected) {
      const connected = await this.connect()
      if (!connected) {
        return false
      }
    }

    return new Promise((resolve) => {
      this.client!.shell(
        { term: 'xterm-256color', cols, rows },
        (err, stream) => {
          if (err) {
            console.error(`[SSH Terminal] Failed to start shell:`, err.message)
            resolve(false)
            return
          }

          this.shell = stream
          this.outputCallbacks.push(onOutput)

          stream.on('data', (data: Buffer) => {
            const str = data.toString()
            this.outputBuffer += str
            this.outputCallbacks.forEach((cb) => {
              cb({
                type: 'stdout',
                data: str,
                timestamp: Date.now(),
              })
            })
          })

          stream.stderr.on('data', (data: Buffer) => {
            const str = data.toString()
            this.outputCallbacks.forEach((cb) => {
              cb({
                type: 'stderr',
                data: str,
                timestamp: Date.now(),
              })
            })
          })

          stream.on('close', () => {
            this.shell = null
            this.outputCallbacks.forEach((cb) => {
              cb({
                type: 'system',
                data: '\r\n[Session ended]\r\n',
                timestamp: Date.now(),
              })
            })
          })

          resolve(true)
        }
      )
    })
  }

  /**
   * Send input to the interactive shell
   */
  async sendInput(input: string): Promise<void> {
    if (this.shell) {
      this.shell.write(input)
    }
  }

  /**
   * Resize the terminal
   */
  async resize(cols: number, rows: number): Promise<void> {
    if (this.shell) {
      this.shell.setWindow(rows, cols, 0, 0)
    }
  }

  /**
   * Get the output buffer (for reconnection scenarios)
   */
  getOutputBuffer(): string {
    return this.outputBuffer
  }

  /**
   * Clear the output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer = ''
  }
}
