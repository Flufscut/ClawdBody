import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import type { SetupState } from '@prisma/client'

// Extended type for AWS fields (may be missing from cached Prisma types)
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get setup state to find computer ID
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    const vmProvider = setupState?.vmProvider || 'orgo'

    // Delete based on provider
    if (vmProvider === 'aws') {
      // Cast to extended type to access AWS fields
      const awsState = setupState as AWSSetupState
      
      // AWS EC2 deletion
      if (!awsState?.awsInstanceId) {
        return NextResponse.json({ error: 'No EC2 instance to delete' }, { status: 404 })
      }

      const awsAccessKeyId = awsState.awsAccessKeyId
      const awsSecretAccessKey = awsState.awsSecretAccessKey
      const awsRegion = awsState.awsRegion || 'us-east-1'

      if (!awsAccessKeyId || !awsSecretAccessKey) {
        return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 })
      }

      const awsClient = new AWSClient({
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
        region: awsRegion,
      })

      try {
        await awsClient.terminateInstance(awsState.awsInstanceId)
        console.log(`Successfully terminated AWS EC2 instance: ${awsState.awsInstanceId}`)
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('not found') || errorMessage.includes('InvalidInstanceID')) {
          console.log(`EC2 instance ${awsState.awsInstanceId} already terminated, continuing with state reset`)
        } else {
          console.warn(`Error terminating EC2 instance (will still reset state):`, errorMessage)
        }
      }

      // Reset AWS-specific state using raw query to bypass TypeScript
      await prisma.$executeRaw`
        UPDATE SetupState SET 
          status = 'pending',
          awsInstanceId = NULL,
          awsInstanceName = NULL,
          awsPublicIp = NULL,
          awsPrivateKey = NULL,
          vmStatus = NULL,
          vmCreated = 0,
          repoCreated = 0,
          repoCloned = 0,
          gitSyncConfigured = 0,
          clawdbotInstalled = 0,
          telegramConfigured = 0,
          gatewayStarted = 0,
          errorMessage = NULL
        WHERE userId = ${session.user.id}
      `
    } else {
      // Orgo deletion
      if (!setupState?.orgoComputerId) {
        return NextResponse.json({ error: 'No computer to delete' }, { status: 404 })
      }

      // Use user's Orgo API key or fallback to environment
      const orgoApiKey = setupState.orgoApiKey || process.env.ORGO_API_KEY
      if (!orgoApiKey) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
      }

      const orgoClient = new OrgoClient(orgoApiKey)

      try {
        await orgoClient.deleteComputer(setupState.orgoComputerId)
        console.log(`Successfully deleted Orgo computer: ${setupState.orgoComputerId}`)
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Computer not found')) {
          console.log(`Computer ${setupState.orgoComputerId} already deleted from Orgo (404), continuing with state reset`)
        } else {
          console.warn(`Error deleting computer from Orgo (will still reset state):`, errorMessage)
        }
      }

      // Reset Orgo-specific state
      await prisma.setupState.update({
        where: { userId: session.user.id },
        data: {
          status: 'pending',
          orgoProjectId: null,
          orgoComputerId: null,
          orgoComputerUrl: null,
          vmStatus: null,
          vmCreated: false,
          repoCreated: false,
          repoCloned: false,
          gitSyncConfigured: false,
          clawdbotInstalled: false,
          telegramConfigured: false,
          gatewayStarted: false,
          errorMessage: null,
        },
      })
    }

    return NextResponse.json({ 
      success: true,
      message: vmProvider === 'aws' ? 'EC2 instance terminated successfully' : 'Computer deleted successfully'
    })

  } catch (error) {
    console.error('Delete computer error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete computer' },
      { status: 500 }
    )
  }
}

