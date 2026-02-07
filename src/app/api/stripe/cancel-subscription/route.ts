import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return new NextResponse('User not found', { status: 404 })
    }

    if (!user.stripeSubscriptionId) {
      return new NextResponse('No active subscription found', { status: 400 })
    }

    // Cancel the subscription at period end
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    return NextResponse.json({ 
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period'
    })
  } catch (error: any) {
    console.error('Cancel Subscription Error:', error)
    return new NextResponse(
      error.message || 'Internal Server Error',
      { status: 500 }
    )
  }
}
