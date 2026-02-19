import { loadStripe } from '@stripe/stripe-js';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.warn('Stripe publishable key not found. Payment processing will not work.');
}

export const stripePromise = stripePublishableKey 
  ? loadStripe(stripePublishableKey) 
  : null;
