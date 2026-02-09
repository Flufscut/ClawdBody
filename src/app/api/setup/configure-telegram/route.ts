import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { E2BClient } from '@/lib/e2b'
import { VMSetup } from '@/lib/vm-setup'
import { AWSVMSetup } from '@/lib/aws-vm-setup'
import { E2BVMSetup } from '@/lib/e2b-vm-setup'
import { decrypt } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { telegramBotToken, telegramUserId, vmId } = await request.json()

    if (!telegramBotToken) {
      return NextResponse.json({ error: 'Telegram bot token is required' }, { status: 400 })
    }

    // Get setup state for shared data
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    // Get LLM config from setup state and decrypt
    const llmApiKeyEncrypted = setupState?.llmApiKey
    const llmProvider = setupState?.llmProvider
    const llmModel = setupState?.llmModel
    
    // LLM API key must be available
    if (!llmApiKeyEncrypted || !llmProvider || !llmModel) {
      return NextResponse.json({ error: 'LLM API key not configured' }, { status: 400 })
    }
    
    const llmApiKey = decrypt(llmApiKeyEncrypted)

    // If vmId is provided, configure that specific VM
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      if (vm.status !== 'running' && vm.status !== 'ready') {
        return NextResponse.json({ error: 'VM is not ready yet' }, { status: 400 })
      }

      if (!vm.clawdbotInstalled) {
        return NextResponse.json({ error: 'Clawdbot is not installed on this VM' }, { status: 400 })
      }

      let telegramSuccess = false
      let gatewaySuccess = false
      const clawdbotVersion = '2026.1.24' // Default version

      // Handle based on provider
      if (vm.provider === 'orgo') {
        const orgoApiKeyEncrypted = setupState?.orgoApiKey
        if (!orgoApiKeyEncrypted) {
          return NextResponse.json({ error: 'Orgo API key not found' }, { status: 400 })
        }
        if (!vm.orgoComputerId) {
          return NextResponse.json({ error: 'Orgo computer ID not found' }, { status: 400 })
        }

        // Decrypt the stored API key
        const orgoClient = new OrgoClient(decrypt(orgoApiKeyEncrypted))
        const vmSetup = new VMSetup(orgoClient, vm.orgoComputerId)

        telegramSuccess = await vmSetup.setupClawdbotTelegram({
          llmApiKey,
          llmProvider,
          llmModel,
          telegramBotToken,
          telegramUserId,
          clawdbotVersion,
          heartbeatIntervalMinutes: 30,
        })

        if (telegramSuccess) {
          gatewaySuccess = await vmSetup.startClawdbotGateway({
            llmApiKey,
            llmProvider,
            telegramBotToken,
          })
        }
      } else if (vm.provider === 'aws') {
        // For AWS, we need to get the credentials from setupState
        const awsState = setupState as any
        if (!awsState?.awsAccessKeyId || !awsState?.awsSecretAccessKey) {
          return NextResponse.json({ error: 'AWS credentials not found' }, { status: 400 })
        }
        if (!vm.awsPublicIp || !vm.awsPrivateKey) {
          return NextResponse.json({ error: 'AWS instance not ready' }, { status: 400 })
        }

        const awsClient = new AWSClient({
          accessKeyId: decrypt(awsState.awsAccessKeyId),
          secretAccessKey: decrypt(awsState.awsSecretAccessKey),
          region: vm.awsRegion || 'us-east-1',
        })

        const awsVMSetup = new AWSVMSetup(
          awsClient,
          vm.awsInstanceId!,
          decrypt(vm.awsPrivateKey),
          vm.awsPublicIp
        )

        const openClawAmi = !!process.env.CLAWDBODY_AWS_OPENCLAW_AMI
        if (openClawAmi) {
          telegramSuccess = await awsVMSetup.setupOpenClawTelegram({
            llmApiKey,
            llmProvider,
            llmModel,
            telegramBotToken,
            telegramUserId,
            heartbeatIntervalMinutes: 30,
          })
          if (telegramSuccess) {
            gatewaySuccess = await awsVMSetup.startOpenClawGateway()
          }
        } else {
          telegramSuccess = await awsVMSetup.setupClawdbotTelegram({
            llmApiKey,
            llmProvider,
            llmModel,
            telegramBotToken,
            telegramUserId,
            clawdbotVersion,
            heartbeatIntervalMinutes: 30,
          })
          if (telegramSuccess) {
            gatewaySuccess = await awsVMSetup.startClawdbotGateway({
              llmApiKey,
              llmProvider,
              telegramBotToken,
            })
          }
        }

        awsVMSetup.cleanup()
      } else if (vm.provider === 'e2b') {
        const e2bApiKeyEncrypted = (setupState as any)?.e2bApiKey
        if (!e2bApiKeyEncrypted) {
          return NextResponse.json({ error: 'E2B API key not found' }, { status: 400 })
        }
        if (!vm.e2bSandboxId) {
          return NextResponse.json({ error: 'E2B sandbox ID not found' }, { status: 400 })
        }

        // Decrypt the stored API key
        const e2bClient = new E2BClient(decrypt(e2bApiKeyEncrypted))
        const sandbox = await e2bClient.connectToSandbox(vm.e2bSandboxId)
        const e2bVMSetup = new E2BVMSetup(e2bClient, sandbox, vm.e2bSandboxId)

        telegramSuccess = await e2bVMSetup.setupClawdbotTelegram({
          llmApiKey,
          llmProvider,
          llmModel,
          telegramBotToken,
          telegramUserId,
          clawdbotVersion,
          heartbeatIntervalMinutes: 30,
        })

        if (telegramSuccess) {
          gatewaySuccess = await e2bVMSetup.startClawdbotGateway({
            llmApiKey,
            llmProvider,
            telegramBotToken,
          })
        }
      } else {
        return NextResponse.json({ error: `Unsupported provider: ${vm.provider}` }, { status: 400 })
      }

      if (!telegramSuccess) {
        return NextResponse.json({ error: 'Failed to configure Telegram' }, { status: 500 })
      }

      // Update VM status
      await prisma.vM.update({
        where: { id: vmId },
        data: { 
          telegramConfigured: true,
          gatewayStarted: gatewaySuccess,
        },
      })

      // Also update SetupState for backward compatibility
      await prisma.setupState.update({
        where: { userId: session.user.id },
        data: { 
          telegramConfigured: true,
          gatewayStarted: gatewaySuccess,
        },
      })

      return NextResponse.json({ 
        success: true,
        telegramConfigured: telegramSuccess,
        gatewayStarted: gatewaySuccess,
        message: gatewaySuccess 
          ? 'Telegram configured and gateway started successfully' 
          : 'Telegram configured but gateway may still be starting'
      })
    }

    // Legacy path: no vmId, use SetupState's orgoComputerId
    if (!setupState?.orgoComputerId) {
      return NextResponse.json({ error: 'VM not found. Please complete setup first or provide vmId.' }, { status: 404 })
    }

    if (setupState.status !== 'ready') {
      return NextResponse.json({ error: 'VM setup is not complete yet' }, { status: 400 })
    }

    const orgoApiKeyEncrypted = setupState.orgoApiKey
    if (!orgoApiKeyEncrypted) {
      return NextResponse.json({ error: 'Orgo API key not found' }, { status: 400 })
    }

    if (!setupState.clawdbotInstalled) {
      return NextResponse.json({ error: 'Clawdbot is not installed. Please complete setup first.' }, { status: 400 })
    }

    // Decrypt the stored API key
    const orgoClient = new OrgoClient(decrypt(orgoApiKeyEncrypted))
    const vmSetup = new VMSetup(orgoClient, setupState.orgoComputerId)

    // Get Clawdbot version from VM
    let clawdbotVersion = '2026.1.24'
    try {
      const versionResult = await orgoClient.bash(
        setupState.orgoComputerId,
        'source ~/.nvm/nvm.sh && clawdbot --version 2>/dev/null | head -1'
      )
      if (versionResult.exit_code === 0 && versionResult.output.trim()) {
        clawdbotVersion = versionResult.output.trim()
      }
    } catch (error) {
    }

    // Configure Telegram
    const telegramSuccess = await vmSetup.setupClawdbotTelegram({
      llmApiKey,
      llmProvider,
      llmModel,
      telegramBotToken,
      telegramUserId,
      clawdbotVersion,
      heartbeatIntervalMinutes: 30,
    })

    if (!telegramSuccess) {
      return NextResponse.json({ error: 'Failed to configure Telegram' }, { status: 500 })
    }

    // Update status
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { telegramConfigured: true },
    })

    // Start the gateway
    const gatewaySuccess = await vmSetup.startClawdbotGateway({
      llmApiKey,
      llmProvider,
      telegramBotToken,
    })

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { gatewayStarted: gatewaySuccess },
    })

    return NextResponse.json({ 
      success: true,
      telegramConfigured: telegramSuccess,
      gatewayStarted: gatewaySuccess,
      message: gatewaySuccess 
        ? 'Telegram configured and gateway started successfully' 
        : 'Telegram configured but gateway may still be starting'
    })

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to configure Telegram' },
      { status: 500 }
    )
  }
}
