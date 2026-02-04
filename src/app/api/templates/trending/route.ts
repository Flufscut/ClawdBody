import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTemplateById, convertDbTemplate, BUILTIN_TEMPLATES, type Template } from '@/lib/templates'

// Mark as dynamic since we use request.url
export const dynamic = 'force-dynamic'

interface TrendingTemplate {
  template: Template
  stats: {
    deployCount: number
    shareCount: number
    recentActivity: number  // Events in last 7 days
  }
}

/**
 * GET /api/templates/trending - Get trending templates
 * 
 * Trending is calculated based on:
 * - Recent deployments (last 7 days)
 * - Recent shares (last 7 days)
 * - Total deploy count
 * 
 * Returns both built-in and user-created templates.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '3')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Get recent activity counts by template
    const recentEvents = await prisma.templateEvent.groupBy({
      by: ['templateId'],
      where: {
        createdAt: { gte: sevenDaysAgo },
        eventType: { in: ['deploy', 'share'] },
      },
      _count: { id: true },
    })

    const recentActivityMap = new Map(
      recentEvents.map(e => [e.templateId, e._count.id])
    )

    // Get user-created templates with their stats
    const dbTemplates = await prisma.marketplaceTemplate.findMany({
      where: { isPublic: true },
      orderBy: [
        { deployCount: 'desc' },
        { shareCount: 'desc' },
      ],
    })

    // Build trending list combining built-in and user-created templates
    const trendingList: TrendingTemplate[] = []

    // Add built-in templates with their activity stats
    for (const template of BUILTIN_TEMPLATES) {
      if (template.comingSoon) continue
      
      const recentActivity = recentActivityMap.get(template.id) || 0
      
      // Get total deploy count from events (for built-in templates)
      const totalDeploys = await prisma.templateEvent.count({
        where: {
          templateId: template.id,
          eventType: 'deploy',
        },
      })

      const totalShares = await prisma.templateEvent.count({
        where: {
          templateId: template.id,
          eventType: 'share',
        },
      })

      trendingList.push({
        template,
        stats: {
          deployCount: totalDeploys,
          shareCount: totalShares,
          recentActivity,
        },
      })
    }

    // Add user-created templates
    for (const dbTemplate of dbTemplates) {
      const template = convertDbTemplate(dbTemplate)
      const recentActivity = recentActivityMap.get(dbTemplate.templateId) || 0

      trendingList.push({
        template,
        stats: {
          deployCount: dbTemplate.deployCount,
          shareCount: dbTemplate.shareCount,
          recentActivity,
        },
      })
    }

    // Sort by trending score:
    // - Recent activity is weighted most heavily (x10)
    // - Deploy count is weighted second (x2)
    // - Share count is weighted least (x1)
    trendingList.sort((a, b) => {
      const scoreA = (a.stats.recentActivity * 10) + (a.stats.deployCount * 2) + a.stats.shareCount
      const scoreB = (b.stats.recentActivity * 10) + (b.stats.deployCount * 2) + b.stats.shareCount
      return scoreB - scoreA
    })

    // Take top N
    const trending = trendingList.slice(0, Math.min(limit, 10))

    return NextResponse.json({
      success: true,
      trending: trending.map(t => ({
        ...t.template,
        stats: t.stats,
      })),
      count: trending.length,
    })

  } catch (error) {
    console.error('[Trending] Error fetching trending templates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch trending templates' },
      { status: 500 }
    )
  }
}
