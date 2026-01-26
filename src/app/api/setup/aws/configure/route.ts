import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { region, instanceType } = await request.json()

    // Update setup state with AWS configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        awsRegion: region || 'us-east-1',
        awsInstanceType: instanceType || 't3.micro',
      } as any,
    })

    return NextResponse.json({
      success: true,
      message: 'AWS configuration saved',
    })

  } catch (error) {
    console.error('AWS configure error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save AWS configuration' },
      { status: 500 }
    )
  }
}
