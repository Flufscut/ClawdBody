import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAllTemplates, convertDbTemplate, TEMPLATE_IDEAS, type Template } from '@/lib/templates'

// Mark as dynamic since we use headers (getServerSession)
export const dynamic = 'force-dynamic'

/**
 * GET /api/templates - List all available templates
 * 
 * Returns both built-in templates (from code) and user-uploaded templates (from DB)
 * Supports pagination for "show more" functionality
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const category = searchParams.get('category') || undefined
    const includeIdeas = searchParams.get('includeIdeas') === 'true'

    // Get built-in templates
    let templates: Template[] = getAllTemplates()
    
    // Get user-created templates from database
    try {
      const dbTemplates = await prisma.marketplaceTemplate.findMany({
        where: { 
          isPublic: true,
          ...(category ? { category } : {}),
        },
        orderBy: { deployCount: 'desc' },
      })
      
      // Convert and merge database templates
      const userTemplates = dbTemplates.map(convertDbTemplate)
      templates = [...templates, ...userTemplates]
    } catch (dbError) {
      console.warn('[Templates] Could not fetch database templates:', dbError)
      // Continue with just built-in templates
    }
    
    // Filter by category if specified
    if (category) {
      templates = templates.filter(t => t.category === category)
    }
    
    // Get total count before pagination
    const total = templates.length
    
    // Apply pagination
    const paginatedTemplates = templates.slice(offset, offset + limit)
    
    // Build response
    const response: any = {
      templates: paginatedTemplates,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    }
    
    // Include template ideas if requested
    if (includeIdeas) {
      response.ideas = TEMPLATE_IDEAS
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Templates] Error listing templates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list templates' },
      { status: 500 }
    )
  }
}
