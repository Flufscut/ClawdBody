import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

/**
 * GET /api/setup/aws/credentials - Get AWS credentials status (without exposing actual credentials)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: {
        awsAccessKeyId: true,
        awsSecretAccessKey: true,
        awsRegion: true,
        awsInstanceType: true,
      },
    })

    return NextResponse.json({
      hasCredentials: !!(setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey),
      region: setupState?.awsRegion || 'us-east-1',
      instanceType: setupState?.awsInstanceType || 'm7i-flex.large',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get AWS credentials status' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/setup/aws/credentials - Update AWS credentials
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accessKeyId, secretAccessKey, region, instanceType } = await request.json()

    if (!accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: 'Access Key ID and Secret Access Key are required' }, { status: 400 })
    }

    // Update credentials in setup state (encrypted)
    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: {
        awsAccessKeyId: encrypt(accessKeyId),
        awsSecretAccessKey: encrypt(secretAccessKey),
        awsRegion: region || 'us-east-1',
        awsInstanceType: instanceType || 'm7i-flex.large',
      },
      create: {
        userId: session.user.id,
        awsAccessKeyId: encrypt(accessKeyId),
        awsSecretAccessKey: encrypt(secretAccessKey),
        awsRegion: region || 'us-east-1',
        awsInstanceType: instanceType || 'm7i-flex.large',
        status: 'pending',
      },
    })

    return NextResponse.json({
      success: true,
      message: 'AWS credentials updated successfully',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update AWS credentials' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/setup/aws/credentials - Delete AWS credentials
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Remove AWS credentials from setup state
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        awsAccessKeyId: null,
        awsSecretAccessKey: null,
        awsRegion: null,
        awsInstanceType: null,
        // Also clear AWS instance info if credentials are being removed
        awsInstanceId: null,
        awsInstanceName: null,
        awsPublicIp: null,
        awsPrivateKey: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'AWS credentials deleted successfully',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete AWS credentials' },
      { status: 500 }
    )
  }
}
