import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { getUserPlanContext, getManagedVMCredentials, getManagedLLMKey } from '@/lib/plans'
import { encrypt } from '@/lib/encryption'

/**
 * Auto-deploy Orgo VM for Pro users
 * POST /api/setup/orgo/auto-deploy
 * 
 * For Pro users, this endpoint:
 * 1. Generates a unique VM name
 * 2. Uses managed Orgo API key (Gorgo Orgo workspace)
 * 3. Uses managed LLM API key
 * 4. Creates VM with 8GB RAM
 * 5. Starts setup process immediately
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check if user is Pro
    const planContext = await getUserPlanContext(userId)
    const isPro = planContext.plan === 'pro' && planContext.stripeSubscriptionId

    if (!isPro) {
      return NextResponse.json({ 
        error: 'Auto-deploy is only available for Pro users' 
      }, { status: 403 })
    }

    // Get managed VM credentials (Orgo)
    const vmCredentials = await getManagedVMCredentials(userId)
    if (!vmCredentials.config || vmCredentials.config.provider !== 'orgo') {
      return NextResponse.json({ 
        error: 'Managed Orgo VM not available. Please configure CLAWDBODY_ORGO_API_KEY.' 
      }, { status: 400 })
    }

    const orgoApiKey = vmCredentials.config.orgoApiKey!
    const orgoClient = new OrgoClient(orgoApiKey)

    // Get managed LLM credentials
    const llmCredentials = await getManagedLLMKey(userId)
    if (!llmCredentials.apiKey) {
      return NextResponse.json({ 
        error: llmCredentials.reason || 'Managed LLM not available' 
      }, { status: 400 })
    }

    // Generate unique VM name
    const generateUniqueVMName = async (): Promise<string> => {
      const baseName = `clawdbot-${Math.random().toString(36).substring(2, 8)}`
      let vmName = baseName
      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        const existing = await prisma.vM.findFirst({
          where: {
            userId,
            name: { equals: vmName, mode: 'insensitive' },
          },
        })

        if (!existing) {
          return vmName
        }

        // Try a new name
        vmName = `clawdbot-${Math.random().toString(36).substring(2, 8)}`
        attempts++
      }

      // Fallback to timestamp-based name
      return `clawdbot-${Date.now()}`
    }

    const vmName = await generateUniqueVMName()
    const sanitizedVMName = sanitizeName(vmName)

    // Get or create "Gorgo Orgo" workspace project
    const projectName = 'Gorgo Orgo'
    let project = await orgoClient.getOrCreateProject(projectName)
    
    // If project doesn't have an ID yet, try to find it or create it
    if (!project.id) {
      const projects = await orgoClient.listProjects()
      const existingProject = projects.find(p => p.name === projectName)
      if (existingProject) {
        project = existingProject
      } else {
        // Project doesn't exist, create it explicitly
        try {
          project = await orgoClient.createProject(projectName)
        } catch (createError: any) {
          // If project creation fails, try listing again (some APIs create projects implicitly)
          const projectsAfter = await orgoClient.listProjects()
          const foundProject = projectsAfter.find(p => p.name === projectName)
          if (foundProject) {
            project = foundProject
          } else {
            return NextResponse.json({ 
              error: `Failed to create or find project "${projectName}": ${createError.message || 'Unknown error'}` 
            }, { status: 400 })
          }
        }
      }
    }

    // Ensure we have a project ID before creating the computer
    if (!project.id) {
      return NextResponse.json({ 
        error: `Project "${projectName}" does not have an ID. Cannot create VM.` 
      }, { status: 400 })
    }

    // Create the VM with 8GB RAM
    const ram = 8
    const cpu = 4 // Orgo requires 4 CPU for 8GB RAM

    let orgoComputerId: string
    let orgoComputerUrl: string

    try {
      const computer = await orgoClient.createComputer(project.id, sanitizedVMName, {
        os: 'linux',
        ram: ram as 8,
        cpu: cpu as 4,
      })

      orgoComputerId = computer.id
      orgoComputerUrl = computer.url
    } catch (orgoError: any) {
      return NextResponse.json({ 
        error: `Failed to create Orgo VM: ${orgoError.message || 'Unknown error'}` 
      }, { status: 400 })
    }

    // Store managed Orgo API key in user's setup state (for future use)
    await prisma.setupState.upsert({
      where: { userId },
      create: {
        userId,
        orgoApiKey: encrypt(orgoApiKey),
        orgoProjectId: project.id,
        orgoProjectName: project.name,
        llmApiKey: encrypt(llmCredentials.apiKey),
        llmProvider: llmCredentials.provider,
        llmModel: llmCredentials.model,
        status: 'provisioning',
      },
      update: {
        orgoApiKey: encrypt(orgoApiKey),
        orgoProjectId: project.id,
        orgoProjectName: project.name,
        llmApiKey: encrypt(llmCredentials.apiKey),
        llmProvider: llmCredentials.provider,
        llmModel: llmCredentials.model,
        status: 'provisioning',
      },
    })

    // Create VM record in database
    const vm = await prisma.vM.create({
      data: {
        userId,
        name: vmName,
        provider: 'orgo',
        status: 'provisioning',
        orgoProjectId: project.id,
        orgoProjectName: project.name,
        orgoComputerId,
        orgoComputerUrl,
        orgoRam: ram,
        orgoCpu: cpu,
        vmCreated: true,
      },
    })

    // Note: Setup will be triggered by the client calling /api/setup/start
    // with useStoredApiKey: true and vmId after receiving this response

    return NextResponse.json({
      success: true,
      vm: {
        id: vm.id,
        name: vm.name,
        provider: vm.provider,
        status: vm.status,
        orgoComputerId: vm.orgoComputerId,
        orgoComputerUrl: vm.orgoComputerUrl,
      },
      message: 'VM deployment started successfully',
    })

  } catch (error) {
    console.error('[Auto-deploy] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to auto-deploy VM' },
      { status: 500 }
    )
  }
}
