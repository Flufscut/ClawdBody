import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getManagedVMCredentials, canAutoProvisionVM } from '@/lib/plans'
import { encrypt } from '@/lib/encryption'

/**
 * POST /api/setup/auto-provision-vm
 * Auto-provision ClawdBody's managed VM credentials for eligible users (Pro plan)
 * 
 * This stores the managed credentials in the user's SetupState so they can be used during VM creation
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check eligibility
    const eligibility = await canAutoProvisionVM(userId)
    if (!eligibility.eligible) {
      return NextResponse.json({
        success: false,
        error: eligibility.reason,
        eligible: false,
      }, { status: 403 })
    }

    // Get the managed credentials
    const managedVM = await getManagedVMCredentials(userId)
    if (!managedVM.config) {
      return NextResponse.json({
        success: false,
        error: managedVM.reason,
        eligible: true,
      }, { status: 503 })
    }

    // Prepare the update data based on provider
    const updateData: Record<string, string> = {
      vmProvider: managedVM.config.provider,
    }

    if (managedVM.config.provider === 'orgo' && managedVM.config.orgoApiKey) {
      updateData.orgoApiKey = encrypt(managedVM.config.orgoApiKey)
    } else if (managedVM.config.provider === 'e2b' && managedVM.config.e2bApiKey) {
      updateData.e2bApiKey = encrypt(managedVM.config.e2bApiKey)
    } else if (managedVM.config.provider === 'aws') {
      if (managedVM.config.awsAccessKeyId) {
        updateData.awsAccessKeyId = encrypt(managedVM.config.awsAccessKeyId)
      }
      if (managedVM.config.awsSecretAccessKey) {
        updateData.awsSecretAccessKey = encrypt(managedVM.config.awsSecretAccessKey)
      }
      if (managedVM.config.awsRegion) {
        updateData.awsRegion = managedVM.config.awsRegion
      }
    }

    // Store the managed credentials in user's SetupState
    await prisma.setupState.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
        status: 'pending',
      },
    })

    return NextResponse.json({
      success: true,
      provider: managedVM.config.provider,
      message: `Managed ${managedVM.config.provider.toUpperCase()} VM credentials provisioned successfully`,
      isManaged: true,
    })
  } catch (error) {
    console.error('Auto-provision VM error:', error)
    return NextResponse.json(
      { error: 'Failed to provision managed VM credentials' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/setup/auto-provision-vm
 * Check if user is eligible for VM auto-provisioning and current status
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check eligibility
    const eligibility = await canAutoProvisionVM(userId)

    // Check if they already have VM credentials configured
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
      select: { 
        vmProvider: true,
        orgoApiKey: true, 
        awsAccessKeyId: true,
        awsSecretAccessKey: true,
        e2bApiKey: true,
      },
    })

    const hasExistingCredentials = !!(
      setupState?.orgoApiKey || 
      (setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey) ||
      setupState?.e2bApiKey
    )

    // Check which managed provider is available
    const managedVM = await getManagedVMCredentials(userId)

    return NextResponse.json({
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      hasExistingCredentials,
      currentProvider: setupState?.vmProvider || null,
      availableManagedProvider: managedVM.config?.provider || null,
    })
  } catch (error) {
    console.error('Check VM auto-provision eligibility error:', error)
    return NextResponse.json(
      { error: 'Failed to check eligibility' },
      { status: 500 }
    )
  }
}
