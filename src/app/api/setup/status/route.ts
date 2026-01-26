import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import type { SetupState } from '@prisma/client'

// Extended type for AWS fields
type AWSSetupState = SetupState & {
  awsAccessKeyId?: string | null
  awsSecretAccessKey?: string | null
  awsRegion?: string | null
  awsInstanceType?: string | null
  awsInstanceId?: string | null
  awsInstanceName?: string | null
  awsPublicIp?: string | null
  awsPrivateKey?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({
        status: 'pending',
        vmCreated: false,
        repoCreated: false,
        repoCloned: false,
        gitSyncConfigured: false,
        clawdbotInstalled: false,
        telegramConfigured: false,
        gatewayStarted: false,
        vmProvider: null,
      })
    }

    // Don't verify computer existence on every status check - this is too aggressive
    // The screenshot endpoint will handle 404s appropriately
    // Only trust the database state - if the computer was deleted, the screenshot endpoint
    // will fail consistently and the frontend can handle that gracefully
    // This prevents false resets due to transient API issues or rate limiting
    // 
    // If you need to verify computer existence, do it explicitly via a separate endpoint
    // or only when the screenshot endpoint consistently fails with 404

    // Return provider-specific fields
    const response: Record<string, unknown> = {
      status: setupState.status,
      vmCreated: setupState.vmCreated,
      repoCreated: setupState.repoCreated,
      repoCloned: setupState.repoCloned,
      gitSyncConfigured: setupState.gitSyncConfigured,
      clawdbotInstalled: setupState.clawdbotInstalled,
      telegramConfigured: setupState.telegramConfigured,
      gatewayStarted: setupState.gatewayStarted,
      vaultRepoUrl: setupState.vaultRepoUrl,
      errorMessage: setupState.errorMessage,
      vmProvider: setupState.vmProvider,
    }

    // Add provider-specific fields
    if (setupState.vmProvider === 'aws') {
      // Cast to extended type to access AWS fields
      const awsState = setupState as AWSSetupState
      response.awsInstanceId = awsState.awsInstanceId
      response.awsInstanceName = awsState.awsInstanceName
      response.awsPublicIp = awsState.awsPublicIp
      response.awsRegion = awsState.awsRegion
      // Construct AWS console URL
      if (awsState.awsInstanceId && awsState.awsRegion) {
        response.awsConsoleUrl = `https://${awsState.awsRegion}.console.aws.amazon.com/ec2/home?region=${awsState.awsRegion}#InstanceDetails:instanceId=${awsState.awsInstanceId}`
      }
    } else {
      // Orgo provider
      response.orgoComputerId = setupState.orgoComputerId
      response.orgoComputerUrl = setupState.orgoComputerUrl
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}


