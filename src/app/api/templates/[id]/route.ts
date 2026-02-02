import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTemplateById, convertDbTemplate, type Template } from '@/lib/templates'

/**
 * GET /api/templates/[id] - Get a single template by ID
 * 
 * Works for both built-in and user-created templates.
 * No authentication required - templates are public.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const templateId = params.id

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // First check built-in templates
    let template: Template | undefined = getTemplateById(templateId)
    
    if (!template) {
      // Check database for user-created templates
      const dbTemplate = await prisma.marketplaceTemplate.findFirst({
        where: { templateId },
      })
      
      if (dbTemplate) {
        template = convertDbTemplate(dbTemplate)
      }
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
    
  } catch (error) {
    console.error('[Templates] Error fetching template:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/templates/[id] - Delete a user-created template
 * 
 * Only the author who created the template can delete it.
 * Built-in templates cannot be deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templateId = params.id

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // Find the template
    const template = await prisma.marketplaceTemplate.findUnique({
      where: { templateId },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Check if the current user is the author
    if (template.authorId !== session.user.id) {
      return NextResponse.json(
        { error: 'You can only delete templates you created' },
        { status: 403 }
      )
    }

    // Delete the template
    await prisma.marketplaceTemplate.delete({
      where: { templateId },
    })

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    })
    
  } catch (error) {
    console.error('[Templates] Error deleting template:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    )
  }
}
