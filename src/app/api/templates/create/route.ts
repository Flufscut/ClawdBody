import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import {
  generateTemplateId,
  type Template,
  type TemplateCategory,
} from '@/lib/templates'

interface CreateTemplateRequest {
  name: string
  description: string
  // Natural language prompt that describes what the template should do
  prompt?: string
  minRam?: number
  websiteUrl?: string
}

interface AIGeneratedTemplate {
  category: TemplateCategory
  logo: string  // Emoji for the template
  skillContent: string
  heartbeatTasks: string[]
}

/**
 * Use Claude to intelligently generate template configuration
 */
async function generateTemplateWithAI(
  name: string,
  description: string,
  prompt?: string
): Promise<AIGeneratedTemplate> {
  const apiKey = process.env.CLAWDBODY_ANTHROPIC_API_KEY
  
  if (!apiKey) {
    // Fallback to basic generation if no API key
    console.warn('[Templates] No CLAWDBODY_ANTHROPIC_API_KEY found, using basic template generation')
    return fallbackTemplateGeneration(name, description, prompt)
  }

  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `You are an AI template generator for ClawdBody, a platform that deploys AI agents to virtual machines.

Your task is to analyze a user's template request and generate:
1. A single emoji that best represents this template (e.g., 📈 for trading, 🤖 for assistant, 📱 for social media)
2. A category classification (exactly one of: "productivity", "social", "dev-tools", "other")
3. A detailed SKILL.md file content that instructs the AI agent on how to perform its tasks
4. A list of heartbeat tasks the agent should periodically check

IMPORTANT: The SKILL.md should be practical and actionable. Include:
- Clear purpose and goals
- Specific instructions on what to do
- How to handle common scenarios
- Error handling guidance
- Security considerations if relevant

Respond in JSON format only:
{
  "logo": "single emoji that represents this template",
  "category": "productivity" | "social" | "dev-tools" | "other",
  "skillContent": "Full markdown content for SKILL.md",
  "heartbeatTasks": ["Task 1 to check periodically", "Task 2", ...]
}`

  const userMessage = `Template Name: ${name}
Short Description: ${description}
${prompt ? `\nDetailed Requirements:\n${prompt}` : ''}

Generate a complete template configuration for this AI agent.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: systemPrompt,
    })

    // Extract the text content
    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI')
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from AI response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    // Validate category
    const validCategories: TemplateCategory[] = ['social', 'productivity', 'dev-tools', 'other']
    const category = validCategories.includes(parsed.category) ? parsed.category : 'other'
    
    // Get logo emoji (default to a robot if not provided)
    const logo = parsed.logo && typeof parsed.logo === 'string' ? parsed.logo : '🤖'

    return {
      category,
      logo,
      skillContent: parsed.skillContent || generateBasicSkillContent(name, description, prompt),
      heartbeatTasks: Array.isArray(parsed.heartbeatTasks) ? parsed.heartbeatTasks : [
        'Check for new tasks and notifications',
        'Execute pending operations as configured'
      ],
    }
  } catch (error) {
    console.error('[Templates] AI generation failed, using fallback:', error)
    return fallbackTemplateGeneration(name, description, prompt)
  }
}

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
 * Fallback template generation when AI is not available
 */
function fallbackTemplateGeneration(
  name: string,
  description: string,
  prompt?: string
): AIGeneratedTemplate {
  // Simple keyword-based category detection
  const lowerName = name.toLowerCase()
  const lowerDesc = description.toLowerCase()
  const combined = lowerName + ' ' + lowerDesc
  
  let category: TemplateCategory = 'other'
  
  if (combined.includes('social') || combined.includes('twitter') || combined.includes('post') || 
      combined.includes('engage') || combined.includes('community') || combined.includes('media')) {
    category = 'social'
  } else if (combined.includes('code') || combined.includes('github') || combined.includes('dev') || 
             combined.includes('review') || combined.includes('deploy') || combined.includes('infra') ||
             combined.includes('monitor') || combined.includes('devops')) {
    category = 'dev-tools'
  } else if (combined.includes('task') || combined.includes('calendar') || combined.includes('email') || 
             combined.includes('assist') || combined.includes('manage') || combined.includes('schedule') ||
             combined.includes('support') || combined.includes('write') || combined.includes('research')) {
    category = 'productivity'
  }

  return {
    category,
    logo: getEmojiForTemplate(name, description),
    skillContent: generateBasicSkillContent(name, description, prompt),
    heartbeatTasks: [
      'Check for new tasks and notifications',
      'Execute pending operations as configured'
    ],
  }
}

/**
 * Generate basic skill content
 */
function generateBasicSkillContent(name: string, description: string, prompt?: string): string {
  return `# ${name}

${description}

${prompt ? `## Purpose\n\n${prompt}\n` : ''}
## Instructions

1. **Understand the Request**: Carefully read and understand what the user wants you to accomplish.

2. **Plan Your Approach**: Before taking action, think through the steps needed to complete the task.

3. **Execute Carefully**: Perform the required actions step by step, verifying each step succeeds before moving on.

4. **Report Progress**: Keep the user informed about what you're doing and any issues encountered.

5. **Handle Errors Gracefully**: If something goes wrong, explain what happened and suggest alternatives.

## Best Practices

- Always confirm understanding before taking significant actions
- Ask for clarification when instructions are ambiguous
- Provide regular status updates on long-running tasks
- Document any changes you make for future reference

## Limitations

- This agent operates within the constraints of its VM environment
- Some actions may require additional permissions or API keys
- Always respect rate limits and usage policies of external services
`
}

/**
 * POST /api/templates/create - Create a new user template
 * 
 * This endpoint allows users to create their own templates using natural language.
 * AI is used to:
 * 1. Auto-classify the category from name and description
 * 2. Generate intelligent SKILL.md content with detailed instructions
 * 
 * The template is saved to the database and becomes available in the marketplace.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateTemplateRequest = await request.json()
    const { name, description, prompt, minRam = 4, websiteUrl } = body

    // Validate required fields
    if (!name || !description) {
      return NextResponse.json(
        { error: 'name and description are required' },
        { status: 400 }
      )
    }

    // Generate template ID
    const templateId = generateTemplateId(name)
    const skillId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    // Use AI to generate template configuration
    const aiGenerated = await generateTemplateWithAI(name, description, prompt)

    // Build setup commands using the AI-generated content
    const heartbeatContent = aiGenerated.heartbeatTasks
      .map(task => `- ${task}`)
      .join('\\n')

    // Escape the skill content for shell
    const escapedSkillContent = aiGenerated.skillContent
      .replace(/'/g, "'\\''")

    const setupCommands = [
      // Create staging directories
      `mkdir -p ~/.openclaw/skills/${skillId} ~/.openclaw/heartbeat-additions ~/.config/${skillId}`,
      
      // Create the AI-generated skill file
      `cat > ~/.openclaw/skills/${skillId}/SKILL.md << 'SKILLEOF'
${aiGenerated.skillContent}
SKILLEOF`,
      
      // Create heartbeat entry with AI-generated tasks
      `echo "## ${name}\\n${heartbeatContent}" > ~/.openclaw/heartbeat-additions/${skillId}.md`,
      
      // Copy to workspace if it exists
      `if [ -d ~/clawd ]; then mkdir -p ~/clawd/skills/${skillId} && cp -r ~/.openclaw/skills/${skillId}/* ~/clawd/skills/${skillId}/ 2>/dev/null || true; fi`,
      
      // Append to HEARTBEAT.md if it exists
      `if [ -f ~/clawd/HEARTBEAT.md ] && ! grep -q "## ${name}" ~/clawd/HEARTBEAT.md; then echo "" >> ~/clawd/HEARTBEAT.md && cat ~/.openclaw/heartbeat-additions/${skillId}.md >> ~/clawd/HEARTBEAT.md; fi`,
    ]

    // Build VM config
    const vmConfig = {
      provider: 'orgo',
      minRam: minRam,
      recommendedRam: Math.max(minRam, 8),
    }

    // Build setup config
    const setupConfig = {
      commands: setupCommands,
    }

    // Build post-setup config
    const postSetupConfig = {
      type: 'none',
      message: `Your ${name} agent is ready. It will automatically handle tasks based on its configuration.`,
    }

    // Create template in database
    const dbTemplate = await prisma.marketplaceTemplate.create({
      data: {
        templateId,
        name,
        description,
        logo: aiGenerated.logo,  // Save the emoji logo
        category: aiGenerated.category,
        authorId: session.user.id,
        authorName: session.user.name || 'Anonymous',
        vmConfig: JSON.stringify(vmConfig),
        setup: JSON.stringify(setupConfig),
        postSetup: JSON.stringify(postSetupConfig),
        websiteUrl: websiteUrl || undefined,
        isPublic: true,  // Make visible to all users
        isVerified: false, // Not yet reviewed
      },
    })

    // Convert to Template interface for response
    const template: Template = {
      id: dbTemplate.templateId,
      name: dbTemplate.name,
      description: dbTemplate.description,
      logo: dbTemplate.logo || aiGenerated.logo,  // Use the emoji logo
      category: dbTemplate.category as TemplateCategory,
      author: dbTemplate.authorName || 'Anonymous',
      authorId: dbTemplate.authorId || undefined,
      websiteUrl: dbTemplate.websiteUrl || undefined,
      isUserCreated: true,
      vmConfig: JSON.parse(dbTemplate.vmConfig),
      setup: JSON.parse(dbTemplate.setup),
      postSetup: JSON.parse(dbTemplate.postSetup || '{}'),
    }

    return NextResponse.json({
      success: true,
      template,
      aiGenerated: {
        category: aiGenerated.category,
        heartbeatTasks: aiGenerated.heartbeatTasks,
      },
      message: `Template created successfully! Category auto-detected as "${aiGenerated.category}".`,
    })
    
  } catch (error) {
    console.error('[Templates] Error creating template:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    )
  }
}
