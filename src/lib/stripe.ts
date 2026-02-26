import { loadStripe, type Stripe } from '@stripe/stripe-js';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.warn('Stripe publishable key not found. Payment processing will not work.');
}

// Lazy singleton: Stripe SDK is only loaded when getStripe() is first called
let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!stripePublishableKey) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey);
  }
  return stripePromise;
};
