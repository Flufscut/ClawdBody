import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createCheckoutSession, STRIPE_PRICES } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { plan, applyDiscount } = body as { 
      plan: 'pro'
      applyDiscount?: boolean 
    }

    if (!plan || plan !== 'pro') {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "pro"' },
        { status: 400 }
      )
    }

    // Check if Stripe is configured
    if (!STRIPE_PRICES.pro) {
      return NextResponse.json(
        { error: 'Stripe prices not configured. Please contact support.' },
        { status: 500 }
      )
    }

    // Get the base URL for redirects
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const checkoutSession = await createCheckoutSession({
      userId: session.user.id,
      plan,
      successUrl: `${baseUrl}/select-vm?welcome=pro`,
      cancelUrl: `${baseUrl}/onboarding?canceled=true`,
      applyEarlyAdopterDiscount: applyDiscount,
    })

    return NextResponse.json({ 
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
