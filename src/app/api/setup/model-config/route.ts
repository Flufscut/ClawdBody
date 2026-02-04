import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'
import { detectProvider, getProviderById, getAmbiguousProviders, getSupportedProvidersText, getKeyFormatsHelp, LLM_PROVIDERS } from '@/lib/llm-providers'

/**
 * GET /api/setup/model-config
 * Get current model configuration and API key status
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { 
        llmApiKey: true, 
        llmProvider: true,
        llmModel: true,
      },
    })

    let maskedKey: string | undefined
    let provider: string | undefined
    let model: string | undefined

    if (setupState?.llmApiKey) {
      try {
        const decryptedKey = decrypt(setupState.llmApiKey)
        maskedKey = decryptedKey.length > 16
          ? `${decryptedKey.slice(0, 12)}...${decryptedKey.slice(-4)}`
          : '***'
        provider = setupState.llmProvider || undefined
        model = setupState.llmModel || undefined
      } catch {}
    }

    return NextResponse.json({
      hasApiKey: !!maskedKey,
      maskedKey,
      provider,
      model,
      supportedProviders: getSupportedProvidersText(),
      keyFormats: getKeyFormatsHelp(),
    })

  } catch (error) {
    console.error('Failed to get model config:', error)
    return NextResponse.json(
      { error: 'Failed to get model configuration' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/setup/model-config
 * Update API key (provider is auto-detected, or can be manually specified for ambiguous keys)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey, model, providerId } = body as {
      apiKey?: string
      model?: string
      providerId?: string  // Optional: for manually selecting provider when key is ambiguous
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    const trimmedKey = apiKey.trim()

    // Check if key is ambiguous (e.g., sk- could be OpenAI or Moonshot)
    const ambiguousProviders = getAmbiguousProviders(trimmedKey)
    
    let finalProvider
    
    if (ambiguousProviders.length > 0 && !providerId) {
      // Key is ambiguous and user hasn't selected a provider
      return NextResponse.json({
        ambiguous: true,
        message: 'This API key could belong to multiple providers. Please select one:',
        providers: ambiguousProviders.map(p => ({
          id: p.id,
          name: p.name,
          defaultModel: p.defaultModel,
        })),
      }, { status: 200 })  // 200 because it's not an error, just needs more info
    }
    
    if (providerId) {
      // User manually selected a provider
      finalProvider = getProviderById(providerId)
      if (!finalProvider) {
        return NextResponse.json({
          error: `Invalid provider: ${providerId}`,
          supportedProviders: getSupportedProvidersText(),
        }, { status: 400 })
      }
    } else {
      // Auto-detect provider from API key
      finalProvider = detectProvider(trimmedKey)
    }

    if (!finalProvider) {
      return NextResponse.json({
        error: 'Could not detect provider from API key',
        help: 'Supported API key formats:',
        keyFormats: getKeyFormatsHelp(),
        supportedProviders: getSupportedProvidersText(),
      }, { status: 400 })
    }

    // Use provided model or default for the provider
    const finalModel = model || finalProvider.defaultModel

    const updateData = {
      llmApiKey: encrypt(trimmedKey),
      llmProvider: finalProvider.id,
      llmModel: finalModel,
    }

    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        ...updateData,
        status: 'pending',
      },
    })

    // Mask the key for response
    const maskedKey = trimmedKey.length > 16
      ? `${trimmedKey.slice(0, 12)}...${trimmedKey.slice(-4)}`
      : '***'

    return NextResponse.json({
      success: true,
      provider: finalProvider.id,
      providerName: finalProvider.name,
      model: finalModel,
      maskedKey,
    })

  } catch (error) {
    console.error('Failed to update model config:', error)
    return NextResponse.json(
      { error: 'Failed to update model configuration' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/setup/model-config
 * Remove the API key
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({ success: true }) // Nothing to delete
    }

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        llmApiKey: null,
        llmProvider: null,
        llmModel: null,
      },
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Failed to delete API key:', error)
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
