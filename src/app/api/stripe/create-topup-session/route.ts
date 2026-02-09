import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

const MIN_TOPUP_CENTS = 500   // $5
const MAX_TOPUP_CENTS = 10000 // $100

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const amountCents = typeof body?.amountCents === 'number' ? body.amountCents : null
    if (amountCents == null || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
      return NextResponse.json(
        { error: `Amount must be between $${MIN_TOPUP_CENTS / 100} and $${MAX_TOPUP_CENTS / 100}` },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { llmCredit: true },
    })
    if (!user?.isPro || !user.llmCredit) {
      return NextResponse.json(
        { error: 'Pro subscription and credit account required' },
        { status: 403 }
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host') ?? 'localhost:3000'}`

    const sessionParams: any = {
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: 'Samantha AI Credits Top-Up',
              description: `$${(amountCents / 100).toFixed(2)} in AI credits`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        type: 'credit_topup',
        amountCents: String(amountCents),
      },
      success_url: `${baseUrl}/dashboard/credits?topup=success`,
      cancel_url: `${baseUrl}/dashboard/credits?topup=cancelled`,
    }

    if (user.stripeCustomerId) {
      sessionParams.customer = user.stripeCustomerId
    } else {
      sessionParams.customer_email = user.email ?? undefined
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('[create-topup-session]', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
