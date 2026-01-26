import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { AWSClient, AWS_REGIONS, AWS_INSTANCE_TYPES } from '@/lib/aws'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accessKeyId, secretAccessKey, region } = await request.json()

    if (!accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: 'AWS credentials are required' }, { status: 400 })
    }

    // Initialize AWS client
    const awsClient = new AWSClient({
      accessKeyId,
      secretAccessKey,
      region: region || 'us-east-1',
    })

    // Validate credentials
    const validation = await awsClient.validateCredentials()
    
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Invalid AWS credentials' 
      }, { status: 400 })
    }

    // List existing Clawdbot instances
    const instances = await awsClient.listInstances()

    // Store credentials in setup state
    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: {
        vmProvider: 'aws',
        awsAccessKeyId: accessKeyId,
        awsSecretAccessKey: secretAccessKey,
        awsRegion: region || 'us-east-1',
      },
      create: {
        userId: session.user.id,
        vmProvider: 'aws',
        awsAccessKeyId: accessKeyId,
        awsSecretAccessKey: secretAccessKey,
        awsRegion: region || 'us-east-1',
        status: 'pending',
      },
    })

    return NextResponse.json({
      success: true,
      message: 'AWS credentials validated successfully',
      instances,
      regions: AWS_REGIONS,
      instanceTypes: AWS_INSTANCE_TYPES,
    })

  } catch (error) {
    console.error('AWS validation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate AWS credentials' },
      { status: 500 }
    )
  }
}
