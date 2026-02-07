import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth' // Assuming this exists, need to check
import { getServerSession } from 'next-auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id || !session?.user?.email) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const { templateId, agentName } = await req.json()

        // Get the base URL from NEXTAUTH_URL or fallback to request headers
        const baseUrl = process.env.NEXTAUTH_URL || 
                       `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host') || 'localhost:3000'}`

        // Create Stripe Checkout Session
        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: process.env.STRIPE_PRO_PRICE_ID, // Ensure this is set in env
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            customer_email: session.user.email,
            metadata: {
                userId: session.user.id,
                action: 'deploy_pro_vm',
                templateId: templateId || '',
                agentName: agentName || '',
            },
            success_url: `${baseUrl}/learning-sources?session_id={CHECKOUT_SESSION_ID}&pro_signup=true`,
            cancel_url: `${baseUrl}/select-vm`,
            allow_promotion_codes: true,
        })

        return NextResponse.json({ url: checkoutSession.url })
    } catch (error) {
        console.error('Stripe Checkout Error:', error)
        return new NextResponse('Internal Error', { status: 500 })
    }
}
