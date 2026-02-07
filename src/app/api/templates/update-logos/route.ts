import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Get a relevant emoji based on keywords in the template name and description
 */
function getEmojiForTemplate(name: string, description: string): string {
  const nameLower = name.toLowerCase()
  const combined = (name + ' ' + description).toLowerCase()
  
  // Check name first for more accurate matching (prioritize template name)
  if (nameLower.includes('assistant') || nameLower.includes('personal')) return '🤖'
  if (nameLower.includes('stock') || nameLower.includes('trading') || nameLower.includes('crypto')) return '📈'
  if (nameLower.includes('social') || nameLower.includes('media manager')) return '📱'
  if (nameLower.includes('data') || nameLower.includes('analysis')) return '📊'
  
  // Then check combined for broader matches
  if (combined.includes('stock') || combined.includes('trading') || combined.includes('crypto') || combined.includes('market')) return '📈'
  if (combined.includes('social') || combined.includes('twitter') || combined.includes('x.com') || combined.includes('media manager')) return '📱'
  if (combined.includes('data') || combined.includes('analysis') || combined.includes('spreadsheet')) return '📊'
  if (combined.includes('code') || combined.includes('github') || combined.includes('review')) return '💻'
  if (combined.includes('devops') || combined.includes('deploy') || combined.includes('infra')) return '🖥️'
  if (combined.includes('monitor') || combined.includes('alert')) return '🔔'
  if (combined.includes('research') || combined.includes('paper') || combined.includes('study')) return '📚'
  if (combined.includes('write') || combined.includes('content') || combined.includes('blog')) return '✍️'
  if (combined.includes('support') || combined.includes('customer') || combined.includes('help')) return '💬'
  if (combined.includes('security') || combined.includes('audit') || combined.includes('scan')) return '🔒'
  if (combined.includes('search') || combined.includes('find')) return '🔍'
  if (combined.includes('automat') || combined.includes('workflow')) return '⚡'
  if (combined.includes('news') || combined.includes('feed')) return '📰'
  if (combined.includes('image') || combined.includes('photo') || combined.includes('visual')) return '🖼️'
  if (combined.includes('video') || combined.includes('youtube')) return '🎬'
  if (combined.includes('music') || combined.includes('audio') || combined.includes('sound')) return '🎵'
  if (combined.includes('game') || combined.includes('play')) return '🎮'
  if (combined.includes('health') || combined.includes('fitness') || combined.includes('medical')) return '🏥'
  if (combined.includes('finance') || combined.includes('budget') || combined.includes('money')) return '💰'
  if (combined.includes('travel') || combined.includes('trip') || combined.includes('flight')) return '✈️'
  if (combined.includes('food') || combined.includes('recipe') || combined.includes('cook')) return '🍳'
  if (combined.includes('shop') || combined.includes('ecommerce') || combined.includes('product')) return '🛒'
  // Put email/calendar after more specific matches
  if (combined.includes('email') || combined.includes('mail')) return '📧'
  if (combined.includes('calendar') || combined.includes('schedule')) return '📅'
  if (combined.includes('assistant') || combined.includes('personal')) return '🤖'
  
  // Default emoji
  return '🤖'
}

/**
 * Use AI to generate a more accurate emoji for the template
 */
async function getEmojiWithAI(name: string, description: string): Promise<string> {
  const apiKey = process.env.CLAWDBODY_ANTHROPIC_API_KEY
  
  if (!apiKey) {
    return getEmojiForTemplate(name, description)
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `What single emoji best represents this AI agent template?

Template Name: ${name}
Description: ${description}

Reply with ONLY a single emoji, nothing else.`
        }
      ],
    })

    const textContent = response.content.find(c => c.type === 'text')
    if (textContent && textContent.type === 'text') {
      const emoji = textContent.text.trim()
      // Validate it's a short emoji-like string
      if (emoji.length <= 8 && !emoji.includes(' ')) {
        return emoji
      }
    }
  } catch (error) {
    console.error('[Templates] AI emoji generation failed:', error)
  }
  
  return getEmojiForTemplate(name, description)
}

/**
 * POST /api/templates/update-logos - Update existing templates with emoji logos
 * 
 * This endpoint updates all templates that have the default '/logos/orgo.png' logo
 * with relevant emojis based on their name and description.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all templates that need updating (have orgo.png as logo or no logo)
    const templatesNeedingUpdate = await prisma.marketplaceTemplate.findMany({
      where: {
        OR: [
          { logo: null },
          { logo: '' },
          { logo: '/logos/orgo.png' },
        ]
      }
    })

    if (templatesNeedingUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No templates need updating',
        updated: 0
      })
    }

    const updates: { id: string; name: string; oldLogo: string | null; newLogo: string }[] = []

    for (const template of templatesNeedingUpdate) {
      const newLogo = await getEmojiWithAI(template.name, template.description)
      
      await prisma.marketplaceTemplate.update({
        where: { id: template.id },
        data: { logo: newLogo }
      })

      updates.push({
        id: template.templateId,
        name: template.name,
        oldLogo: template.logo,
        newLogo
      })
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updates.length} template(s) with emoji logos`,
      updated: updates.length,
      templates: updates
    })

  } catch (error) {
    console.error('[Templates] Error updating logos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update logos' },
      { status: 500 }
    )
  }
}
