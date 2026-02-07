import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deployProVM } from '@/lib/pro-deployment'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        // Verify Pro status or passed session_id
        const { session_id, templateId, agentName } = await req.json()

        let isPro = false

        // 1. Check via Session ID if provided (immediate post-checkout)
        if (session_id) {
            const checkoutSession = await stripe.checkout.sessions.retrieve(session_id)
            if (checkoutSession.payment_status === 'paid' && checkoutSession.metadata?.userId === session.user.id) {
                isPro = true
            }
        }

        // 2. Check DB if not verified by session
        if (!isPro) {
            const user = await prisma.user.findUnique({ where: { id: session.user.id } })
            if (user?.isPro) {
                isPro = true
            }
        }

        if (!isPro) {
            return new NextResponse('Payment required', { status: 402 })
        }

        // 3. Ensure User is marked Pro in DB (idempotent)
        await prisma.user.update({
            where: { id: session.user.id },
            data: { isPro: true }
        })

        // 4. Check if VM already exists/provisioning
        const existingVM = await prisma.vM.findFirst({
            where: {
                userId: session.user.id,
                status: { in: ['creating', 'provisioning', 'running', 'pending', 'configuring_vm'] }
            }
        })

        if (existingVM) {
            // If VM exists and is recent (e.g. created by webhook), just return it
            return NextResponse.json({
                vm: existingVM,
                message: 'VM already exists or is being provisioned'
            })
        }

        // 5. Trigger Deployment
        const vm = await deployProVM({
            userId: session.user.id,
            name: 'Pro Workspace',
            templateId,
            agentName,
        })

        return NextResponse.json({ vm, message: 'Pro VM deployment started' })

    } catch (error) {
        console.error('Pro Deployment API Error:', error)
        return new NextResponse('Internal Error', { status: 500 })
    }
}
