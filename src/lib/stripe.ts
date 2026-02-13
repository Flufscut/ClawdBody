import Stripe from 'stripe'

// Reason: Lazy initialization to prevent build-time errors when STRIPE_SECRET_KEY
// is not yet set (e.g., during Railway/Vercel builds where env vars may be absent).
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY
        if (!key) {
            throw new Error('STRIPE_SECRET_KEY is not set. Stripe features are unavailable.')
        }
        _stripe = new Stripe(key, {
            apiVersion: '2024-06-20' as any,
            typescript: true,
        })
    }
    return _stripe
}

// Reason: Backwards-compatible export for existing imports. Uses a Proxy so that
// property access / method calls are forwarded to the lazily-initialized instance.
export const stripe: Stripe = new Proxy({} as Stripe, {
    get(_target, prop, receiver) {
        return Reflect.get(getStripe(), prop, receiver)
    },
})
