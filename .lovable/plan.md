

## Analysis: Google Maps API Key Exposure

The `VITE_GOOGLE_MAPS_API_KEY` is stored in the `.env` file, and `.env` is **not listed in `.gitignore`**, meaning it gets committed to your GitHub repository. Anyone with access to the repo can see the key.

### Important context

- **Client-side keys like Google Maps are inherently public** — they end up in the browser JavaScript bundle regardless. Google expects this and provides **API key restrictions** (HTTP referrer restrictions, API restrictions) in the Google Cloud Console to control usage. So the key being in client-side code is normal.
- **The `.env` file being committed is the problem** — it also contains your Supabase keys and could contain other secrets in the future.

### Plan

**1. Add `.env` to `.gitignore`**

Add `.env` to the `.gitignore` file so it's no longer tracked in future commits.

**2. Secure the Google Maps API key in Google Cloud Console (manual step)**

This is the most important protection for a client-side Maps key. You should:
- Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
- Edit the API key and add **Application restrictions** → "HTTP referrers" → add your domains (`green-grass-magic.lovable.app/*`, `*.lovable.app/*`, and `localhost:*` for dev)
- Add **API restrictions** → restrict to only the APIs you use (Maps JavaScript API, Geocoding API, Distance Matrix API, Places API)

This ensures even if someone copies your key, it won't work from their domain.

### Technical details

- The `.env` file currently contains: `VITE_GOOGLE_MAPS_API_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SUPABASE_*` keys
- Note: Since the `.env` is auto-managed by Lovable Cloud, adding it to `.gitignore` prevents repo exposure but Lovable will still inject it at build time
- The Stripe publishable key (`pk_test_...`) is also designed to be public, similar to Maps keys
- The edge function (`route-optimization`) reads the key from `Deno.env`, which is server-side and already secure

