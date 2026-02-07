import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { deployProVM } from '@/lib/pro-deployment'
import { headers } from 'next/headers'

export async function POST(req: NextRequest) {
    const body = await req.text()
    const signature = headers().get('Stripe-Signature') as string

    let event

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (error: any) {
        console.error('Webhook signature verification failed.', error.message)
        return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as any

            const userId = session.metadata?.userId
            const action = session.metadata?.action

            if (userId) {
                // Update user status
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        isPro: true,
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                    },
                })

                // Don't deploy here - let the frontend handle deployment via /api/vms/deploy-pro
                // This avoids webhook timeout issues and provides better UX with progress updates
                if (action === 'deploy_pro_vm') {
                    console.log(`[Stripe Webhook] Pro subscription activated for ${userId}. VM deployment will be triggered by frontend.`)
                }
            }
        } else if (event.type === 'invoice.payment_succeeded') {
            // Handle recurring payments if needed
            // For now, checkout.session.completed handles the initial one
        }

        return new NextResponse(null, { status: 200 })
    } catch (error) {
        console.error('Webhook handler failed:', error)
        return new NextResponse('Webhook Handler Error', { status: 500 })
    }
}
