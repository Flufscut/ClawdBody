import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'
import { applyTopUp } from '@/lib/credit-topup'
import { ensureLlmCreditForProUser } from '@/lib/pro-credits-provisioning'

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
            const type = session.metadata?.type

            // Credit top-up (one-time payment)
            if (type === 'credit_topup' && userId) {
                const amountCents = parseInt(session.metadata?.amountCents ?? '0', 10)
                if (amountCents > 0) {
                    try {
                        await applyTopUp(userId, amountCents, session.id)
                        console.log(`[Stripe Webhook] Credit top-up applied for ${userId}: $${(amountCents / 100).toFixed(2)}`)
                    } catch (err) {
                        console.error('[Stripe Webhook] applyTopUp failed:', err)
                        return new NextResponse('Top-up application failed', { status: 500 })
                    }
                }
                return new NextResponse(null, { status: 200 })
            }

            // Pro subscription
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

                // Provision OpenRouter credits for Pro (idempotent)
                await ensureLlmCreditForProUser(userId)

                // Don't deploy here - let the frontend handle deployment via /api/vms/deploy-pro
                if (action === 'deploy_pro_vm') {
                    console.log(`[Stripe Webhook] Pro subscription activated for ${userId}. VM deployment will be triggered by frontend.`)
                }
            }
        } else if (event.type === 'invoice.payment_succeeded') {
            // Handle recurring payments if needed
            // For now, checkout.session.completed handles the initial one
        } else if (event.type === 'customer.subscription.deleted') {
            // This event fires when a subscription is actually cancelled/deleted
            // This happens when cancel_at_period_end was true and the period has ended
            const subscription = event.data.object as any
            
            // Find user by subscription ID
            const user = await prisma.user.findFirst({
                where: { stripeSubscriptionId: subscription.id },
            })

            if (user) {
                // Set user back to Free tier
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        isPro: false,
                        // Keep stripeCustomerId for reference, but clear subscriptionId since it's deleted
                        stripeSubscriptionId: null,
                    },
                })

                console.log(`[Stripe Webhook] Subscription ${subscription.id} ended for user ${user.id}. User switched to Free tier.`)
            } else {
                console.warn(`[Stripe Webhook] Subscription ${subscription.id} deleted but no user found with this subscription ID.`)
            }
        } else if (event.type === 'customer.subscription.updated') {
            // Track when cancel_at_period_end is set (optional - for logging/monitoring)
            const subscription = event.data.object as any
            
            if (subscription.cancel_at_period_end) {
                const user = await prisma.user.findFirst({
                    where: { stripeSubscriptionId: subscription.id },
                })

                if (user) {
                    console.log(`[Stripe Webhook] Subscription ${subscription.id} for user ${user.id} will cancel at period end (${new Date(subscription.current_period_end * 1000).toISOString()}).`)
                }
            }
        }

        return new NextResponse(null, { status: 200 })
    } catch (error) {
        console.error('Webhook handler failed:', error)
        return new NextResponse('Webhook Handler Error', { status: 500 })
    }
}
