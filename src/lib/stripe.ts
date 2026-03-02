import { loadStripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error('VITE_STRIPE_PUBLISHABLE_KEY is not defined in environment variables')
}

export const stripePromise = loadStripe(publishableKey)

export interface StripeProduct {
  name: string
  price: number
  storage: string
  recurring?: boolean
}

export const STRIPE_PRODUCTS: Record<string, StripeProduct> = {
  PRO_SUBSCRIPTION: {
    name: 'Pro Subscription',
    price: 5,
    storage: '10GB',
    recurring: true
  },
  LIFETIME: {
    name: 'Lifetime',
    price: 80,
    storage: '15GB',
    recurring: false
  },
  STORAGE_10GB: {
    name: 'Storage 10GB',
    price: 1,
    storage: '10GB',
    recurring: true
  }
}
