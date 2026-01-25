import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { GmailClient, getGmailTokens } from '@/lib/gmail'
import { CalendarClient, getCalendarTokens } from '@/lib/calendar'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url))
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const scope = searchParams.get('scope') || ''

    if (error) {
      // Determine which service failed based on scope
      const isCalendar = scope.includes('calendar')
      const service = isCalendar ? 'calendar' : 'gmail'
      return NextResponse.redirect(new URL(`/learning-sources?error=${service}_auth_failed`, request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_code', request.url))
    }

    // Check if this is a Calendar or Gmail connection based on scope
    const isCalendar = scope.includes('calendar.readonly') || scope.includes('calendar')
    
    // Route to appropriate handler
    if (isCalendar) {
      return handleCalendarCallback(request, session.user.id, code)
    } else {
      return handleGmailCallback(request, session.user.id, code)
    }

  } catch (error: any) {
    console.error('Google callback error:', error)
    return NextResponse.redirect(new URL('/learning-sources?error=callback_failed', request.url))
  }
}

async function handleCalendarCallback(request: NextRequest, userId: string, code: string) {
  try {
    // Exchange code for tokens
    const tokens = await getCalendarTokens(code)

    // Store Calendar account in database
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'calendar',
          providerAccountId: userId,
        },
      },
      create: {
        userId: userId,
        type: 'oauth',
        provider: 'calendar',
        providerAccountId: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
      },
    })

    // Get user's setup state to find vault repo
    const setupState = await prisma.setupState.findUnique({
      where: { userId: userId },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_vault', request.url))
    }

    // Get GitHub access token for writing to vault
    const githubAccount = await prisma.account.findFirst({
      where: { userId: userId, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_github', request.url))
    }

    // Fetch calendar events and write to vault
    try {
      const calendarClient = new CalendarClient(
        tokens.access_token,
        tokens.refresh_token
      )

      const calendarEmail = await calendarClient.getUserCalendarEmail()
      const events = await calendarClient.fetchEvents(50)
      const githubClient = new GitHubClient(githubAccount.access_token)

      // Format events for vault
      const eventsContent = events
        .map(event => calendarClient.formatEventForVault(event))
        .join('\n\n---\n\n')

      // Write to vault
      await githubClient.writeFileToVault(
        setupState.vaultRepoName,
        'integrations/calendar/events.md',
        `# Google Calendar Events

*Last synced: ${new Date().toISOString()}*
*Calendar: ${calendarEmail}*

${eventsContent}
`,
        'Sync calendar events to vault'
      )

      // Create or update Integration record
      await prisma.integration.upsert({
        where: {
          userId_provider: {
            userId: userId,
            provider: 'calendar',
          },
        },
        create: {
          userId: userId,
          provider: 'calendar',
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: calendarEmail }),
        },
        update: {
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: calendarEmail }),
        },
      })

      return NextResponse.redirect(new URL('/learning-sources?calendar_connected=true', request.url))
    } catch (error: any) {
      console.error('Calendar sync error:', error)
      return NextResponse.redirect(new URL('/learning-sources?error=calendar_sync_failed', request.url))
    }
  } catch (error: any) {
    console.error('Calendar callback error:', error)
    return NextResponse.redirect(new URL('/learning-sources?error=calendar_callback_failed', request.url))
  }
}

async function handleGmailCallback(request: NextRequest, userId: string, code: string) {
  try {
    // Exchange code for tokens
    const tokens = await getGmailTokens(code)

    // Get user to find email
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    // Store Gmail account in database
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'gmail',
          providerAccountId: user?.email || userId,
        },
      },
      create: {
        userId: userId,
        type: 'oauth',
        provider: 'gmail',
        providerAccountId: user?.email || userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
      },
    })

    // Get user's setup state to find vault repo
    const setupState = await prisma.setupState.findUnique({
      where: { userId: userId },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_vault', request.url))
    }

    // Get GitHub access token for writing to vault
    const githubAccount = await prisma.account.findFirst({
      where: { userId: userId, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_github', request.url))
    }

    // Fetch Gmail messages and write to vault
    try {
      const gmailClient = new GmailClient(
        tokens.access_token,
        tokens.refresh_token
      )

      // Get user's email address
      const userEmail = await gmailClient.getUserEmail()

      // Fetch messages (limit to 50 to avoid quota issues)
      console.log('Fetching Gmail messages...')
      const allMessages = await gmailClient.fetchAllMessages(50, 50)
      console.log(`Fetched ${allMessages.length} total messages`)

      const githubClient = new GitHubClient(githubAccount.access_token)

      // Batch messages into files (50 per file)
      const batchSize = 50
      const batches: any[][] = []
      for (let i = 0; i < allMessages.length; i += batchSize) {
        batches.push(allMessages.slice(i, i + batchSize))
      }

      // Write each batch to a separate file
      const filePromises = batches.map(async (batch, index) => {
        const messagesContent = batch
          .map(msg => gmailClient.formatMessageForVault(msg))
          .join('\n\n---\n\n')

        const fileName = index === 0 
          ? 'integrations/gmail/messages.md'
          : `integrations/gmail/messages-${index + 1}.md`

        return githubClient.writeFileToVault(
          setupState.vaultRepoName,
          fileName,
          `# Gmail Messages (Batch ${index + 1} of ${batches.length})

*Last synced: ${new Date().toISOString()}*
*Total messages: ${allMessages.length}*
*Messages in this batch: ${batch.length}*

${messagesContent}
`,
          `Sync Gmail messages batch ${index + 1} to vault`
        )
      })

      await Promise.all(filePromises)

      // Create an index file
      await githubClient.writeFileToVault(
        setupState.vaultRepoName,
        'integrations/gmail/index.md',
        `# Gmail Integration

**Connected Email:** ${userEmail}
**Last Synced:** ${new Date().toISOString()}
**Total Messages:** ${allMessages.length}
**Files:** ${batches.length}

## Message Files

${batches.map((_, index) => {
  const fileName = index === 0 ? 'messages.md' : `messages-${index + 1}.md`
  return `- [${fileName}](./${fileName}) - ${batches[index].length} messages`
}).join('\n')}
`,
        'Create Gmail integration index'
      )

      // Create or update Integration record
      await prisma.integration.upsert({
        where: {
          userId_provider: {
            userId: userId,
            provider: 'gmail',
          },
        },
        create: {
          userId: userId,
          provider: 'gmail',
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: userEmail }),
        },
        update: {
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: userEmail }),
        },
      })

      return NextResponse.redirect(new URL('/learning-sources?gmail_connected=true', request.url))
    } catch (error: any) {
      console.error('Gmail sync error:', error)
      return NextResponse.redirect(new URL('/learning-sources?error=gmail_sync_failed', request.url))
    }
  } catch (error: any) {
    console.error('Gmail callback error:', error)
    return NextResponse.redirect(new URL('/learning-sources?error=gmail_callback_failed', request.url))
  }
}

