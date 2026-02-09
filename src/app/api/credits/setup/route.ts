import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureLlmCreditForProUser } from '@/lib/pro-credits-provisioning'

/**
 * POST /api/credits/setup
 * Creates an LlmCredit record and OpenRouter key for an existing Pro user who doesn't have one yet.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })
  if (!user?.isPro) {
    return NextResponse.json(
      { error: 'Pro subscription required to set up credits' },
      { status: 403 }
    )
  }

  const ok = await ensureLlmCreditForProUser(session.user.id)
  if (!ok) {
    return NextResponse.json(
      {
        error:
          'Could not create credit account. Use a Provisioning API key.',
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
