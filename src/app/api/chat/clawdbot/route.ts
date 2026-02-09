/**
 * Clawdbot Chat API
 * 
 * Proxies chat messages to the Clawdbot agent running on the VM.
 * Uses `clawdbot agent --local --session-id <userId> --message "..."` to communicate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findSetupStateDecrypted, findFirstVMDecrypted } from '@/lib/prisma-encrypted'
import { OrgoClient } from '@/lib/orgo'
import { SSHTerminalProvider } from '@/lib/terminal/ssh-terminal'
import { E2BClient } from '@/lib/e2b'
import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo } from '@/lib/openrouter-provisioning'

export const maxDuration = 300 // 5 minutes max for long responses

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, vmId, sessionId } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get the setup state to determine VM provider and credentials
    const setupState = await findSetupStateDecrypted({ userId: session.user.id })
    
    if (!setupState) {
      return NextResponse.json({ error: 'Setup not found' }, { status: 404 })
    }

    // Determine the VM provider - check VM record first if vmId provided
    let vmProvider = setupState.vmProvider
    let vm: {
      provider: string
      orgoComputerId?: string | null
      awsPublicIp?: string | null
      awsPrivateKey?: string | null
      e2bSandboxId?: string | null
    } | null = null
    
    if (vmId) {
      // Use decrypted helper to get the private key in plaintext
      const fullVm = await findFirstVMDecrypted({ 
        where: { id: vmId, userId: session.user.id }
      })
      if (fullVm) {
        vm = {
          provider: fullVm.provider,
          orgoComputerId: fullVm.orgoComputerId,
          awsPublicIp: fullVm.awsPublicIp,
          awsPrivateKey: fullVm.awsPrivateKey,
          e2bSandboxId: fullVm.e2bSandboxId,
        }
        vmProvider = fullVm.provider
      }
    }
    
    // Fallback: detect provider from available credentials
    if (!vmProvider) {
      if (setupState.awsInstanceId || setupState.awsPublicIp) {
        vmProvider = 'aws'
      } else if (setupState.e2bApiKey && vm?.e2bSandboxId) {
        vmProvider = 'e2b'
      } else if (setupState.orgoComputerId) {
        vmProvider = 'orgo'
      } else {
        return NextResponse.json({ error: 'No VM configured' }, { status: 400 })
      }
    }
    
    // Use user's session ID or a default session for the chat
    const chatSessionId = sessionId || `web-${session.user.id.slice(0, 8)}`
    
    // Escape the message for shell command (handle quotes and special chars)
    const escapedMessage = message
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
    
    // Get LLM API key (unified approach)
    const llmApiKey = (setupState as any).llmApiKey
    const llmProvider = (setupState as any).llmProvider || 'anthropic'
    const llmModel = (setupState as any).llmModel
    
    // Validate we have an API key
    if (!llmApiKey) {
      return NextResponse.json({ error: 'No API key configured. Please add an LLM API key.' }, { status: 400 })
    }

    // Pro / OpenRouter: check credits before running the agent (never use Anthropic key for Pro)
    let creditsWarning: string | null = null
    const isManagedOpenRouter = (setupState as any).isManagedLlmApiKey && llmProvider === 'openrouter'
    if (isManagedOpenRouter) {
      const llmCredit = await prisma.llmCredit.findUnique({ where: { userId: session.user.id } })
      if (llmCredit) {
        try {
          const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
          const remaining = keyInfo.limit_remaining
          if (remaining != null && remaining <= 0) {
            return NextResponse.json(
              {
                error: 'credits_exhausted',
                message: 'Your AI credits are used up. Please add more credits to continue.',
                refillUrl: '/dashboard/credits',
              },
              { status: 402 }
            )
          }
          if (remaining != null && remaining < 2) {
            creditsWarning = 'Your AI credits are running low. Add more at Dashboard → AI Credits to avoid interruption.'
          }
        } catch (e) {
          console.warn('[Clawdbot] Credit check failed:', e)
        }
      }
    }

    // Build environment variable exports based on provider
    const envExports: string[] = []
    const envVarMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
      groq: 'GROQ_API_KEY',
      xai: 'XAI_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      fireworks: 'FIREWORKS_API_KEY',
      cohere: 'COHERE_API_KEY',
      moonshot: 'MOONSHOT_API_KEY',
    }
    const envVarName = envVarMap[llmProvider] || 'ANTHROPIC_API_KEY'
    envExports.push(`export ${envVarName}="${llmApiKey}"`)
    
    // Build the clawdbot command
    // Note: Model is configured in ~/.clawdbot/clawdbot.json, not via CLI flag
    const clawdbotCommand = `clawdbot agent --local --session-id "${chatSessionId}" --message "${escapedMessage}"`
    
    // Wrap command to source NVM and set API keys for the agent
    const wrappedCommand = `
source ~/.bashrc 2>/dev/null || true
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
${envExports.join('\n')}
${clawdbotCommand}
`.trim()

    let result: { output: string; exitCode?: number } | null = null

    if (vmProvider === 'orgo') {
      // Execute via Orgo API
      const orgoApiKey = setupState.orgoApiKey
      if (!orgoApiKey) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 400 })
      }

      const computerId = vm?.orgoComputerId || setupState.orgoComputerId

      if (!computerId) {
        return NextResponse.json({ error: 'Orgo computer not found' }, { status: 404 })
      }

      const client = new OrgoClient(orgoApiKey)
      
      // Use background execution to work around Orgo's 30-second timeout on older computers
      // This runs the command in background and polls for results
      const jobId = `clawdbot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const outputFile = `/tmp/${jobId}.out`
      const doneFile = `/tmp/${jobId}.done`
      const pidFile = `/tmp/${jobId}.pid`
      
      // Create a script that runs the command and signals completion
      const bgScript = `
cat > /tmp/${jobId}.sh << 'SCRIPT_EOF'
#!/bin/bash
source ~/.bashrc 2>/dev/null || true
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export ${envVarName}="${llmApiKey}"
${clawdbotCommand} > ${outputFile} 2>&1
echo $? > ${doneFile}
SCRIPT_EOF
chmod +x /tmp/${jobId}.sh
nohup /tmp/${jobId}.sh > /dev/null 2>&1 &
echo $! > ${pidFile}
cat ${pidFile}
`.trim()

      try {
        // Start the background job (this should complete quickly)
        const startResult = await client.bash(computerId, bgScript, 25000, 20)
        const pid = startResult.output?.trim()
        
        if (!pid) {
          throw new Error('Failed to start background job')
        }
        
        // Poll for completion (up to 3 minutes, checking every 10 seconds)
        // 10 seconds is reasonable - responsive but not excessive API calls
        const maxPolls = 18
        const pollInterval = 10000
        
        for (let i = 0; i < maxPolls; i++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
          
          // Check if done file exists
          const checkCmd = `if [ -f ${doneFile} ]; then echo "DONE"; cat ${outputFile} 2>/dev/null; else echo "RUNNING"; fi`
          const checkResult = await client.bash(computerId, checkCmd, 25000, 20)
          const checkOutput = checkResult.output || ''
          
          if (checkOutput.startsWith('DONE')) {
            // Command completed - extract output (everything after "DONE\n")
            const output = checkOutput.slice(5).trim()
            
            // Cleanup temp files
            client.bash(computerId, `rm -f /tmp/${jobId}.sh ${outputFile} ${doneFile} ${pidFile}`, 10000, 10).catch(() => {})
            
            result = { output, exitCode: 0 }
            break
          }
          
          // Still running, continue polling
          if (i === maxPolls - 1) {
            // Timeout - kill the process and cleanup
            client.bash(computerId, `kill $(cat ${pidFile} 2>/dev/null) 2>/dev/null; rm -f /tmp/${jobId}.sh ${outputFile} ${doneFile} ${pidFile}`, 10000, 10).catch(() => {})
            
            return NextResponse.json({
              error: 'The AI is taking too long to respond. Please try a simpler question or try again later.',
            }, { status: 504 })
          }
        }
        
      } catch (orgoError: any) {
        const errorMsg = orgoError?.message || ''
        console.error('Orgo chat error:', errorMsg)
        
        // Cleanup on error
        client.bash(computerId, `rm -f /tmp/${jobId}.sh ${outputFile} ${doneFile} ${pidFile}`, 10000, 10).catch(() => {})
        
        throw orgoError
      }

    } else if (vmProvider === 'aws') {
      // Execute via SSH on AWS
      const publicIp = vm?.awsPublicIp || setupState.awsPublicIp
      const privateKey = vm?.awsPrivateKey || setupState.awsPrivateKey
      
      if (!publicIp || !privateKey) {
        return NextResponse.json({ error: 'AWS instance not properly configured' }, { status: 400 })
      }

      // Detect username based on AMI type
      // Custom AMI (Amazon Linux) uses ec2-user, default Ubuntu AMI uses ubuntu
      const usingCustomAmi = !!process.env.CLAWDBODY_AWS_CUSTOM_AMI_ID
      const sshUsername = usingCustomAmi ? 'ec2-user' : 'ubuntu'

      // Create SSH terminal provider for AWS
      const sshProvider = new SSHTerminalProvider({
        sessionId: `chat-${chatSessionId}`,
        provider: 'aws',
        host: publicIp,
        port: 22,
        username: sshUsername,
        privateKey: privateKey,
      })

      const sshResult = await sshProvider.execute(wrappedCommand)
      await sshProvider.disconnect()
      
      // Combine stdout and stderr - clawdbot may output to either
      const combinedOutput = [sshResult.stdout, sshResult.stderr]
        .filter(Boolean)
        .join('\n')
        .trim()
      
      result = { 
        output: combinedOutput || sshResult.error || '', 
        exitCode: sshResult.success ? 0 : 1 
      }
      
      console.log('SSH result:', { 
        success: sshResult.success, 
        stdoutLen: sshResult.stdout?.length, 
        stderrLen: sshResult.stderr?.length,
        error: sshResult.error 
      })

    } else if (vmProvider === 'e2b') {
      // Execute via E2B
      const e2bApiKey = setupState.e2bApiKey
      const sandboxId = vm?.e2bSandboxId

      if (!e2bApiKey || !sandboxId) {
        return NextResponse.json({ error: 'E2B not configured - sandbox ID not found' }, { status: 400 })
      }

      const e2bClient = new E2BClient(e2bApiKey)
      const sandbox = await e2bClient.connectToSandbox(sandboxId)
      
      if (!sandbox) {
        return NextResponse.json({ error: 'E2B sandbox not found or expired' }, { status: 404 })
      }

      const e2bResult = await e2bClient.executeCommand(sandbox, wrappedCommand)
      result = { output: e2bResult.stdout || e2bResult.stderr || '', exitCode: e2bResult.exitCode }

    } else {
      return NextResponse.json({ error: `Unsupported VM provider: ${vmProvider}` }, { status: 400 })
    }

    // Ensure we have a result
    if (!result) {
      return NextResponse.json({ error: 'Failed to execute command' }, { status: 500 })
    }

    // Parse the response - Clawdbot typically outputs the response directly
    const rawOutput = result.output || ''
    
    // If no output at all, return helpful debug info
    if (!rawOutput.trim()) {
      console.log('Clawdbot returned empty output. Exit code:', result.exitCode)
      return NextResponse.json({
        success: true,
        response: `Command executed but returned no output. Exit code: ${result.exitCode ?? 'unknown'}. The agent may still be processing or there was an error.`,
        sessionId: chatSessionId,
        exitCode: result.exitCode,
        debug: { rawOutput, vmProvider },
        ...(creditsWarning && { creditsWarning, refillUrl: '/dashboard/credits' }),
      })
    }
    
    // Remove ANSI escape codes
    let response = rawOutput.replace(/\x1b\[[0-9;]*m/g, '')
    
    // Remove the Clawdbot banner line (starts with 🦞)
    const lines = response.split('\n')
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim()
      // Skip banner lines
      if (trimmed.startsWith('🦞')) return false
      if (trimmed.includes('Clawdbot 20')) return false
      return true
    })
    
    // Find where the actual response starts (after any empty lines at start)
    let startIndex = 0
    while (startIndex < filteredLines.length && filteredLines[startIndex].trim() === '') {
      startIndex++
    }
    
    response = filteredLines.slice(startIndex).join('\n').trim()
    
    // If filtering removed everything, return the raw output instead
    if (!response && rawOutput.trim()) {
      response = rawOutput.trim()
    }

    return NextResponse.json({
      success: true,
      response,
      sessionId: chatSessionId,
      exitCode: result.exitCode,
      ...(creditsWarning && { creditsWarning, refillUrl: '/dashboard/credits' }),
    })

  } catch (error) {
    console.error('Clawdbot chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
