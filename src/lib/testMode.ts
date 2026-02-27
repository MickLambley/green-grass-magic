/**
 * TEST MODE - Secure activation via URL query parameter.
 *
 * Security:
 * 1. URL must contain ?test_key=<value> (validated server-side only)
 * 2. VITE_ENABLE_TEST_MODE must be "true"
 * 3. sessionStorage flag limits activation to the current tab
 * 4. The secret key is NEVER bundled into client-side code
 */

const SESSION_FLAG_KEY = "testModeActive";
const SESSION_KEY_KEY = "testModeKey";

/**
 * Returns true when the test mode button should be shown on the auth page.
 */
export function isTestModeAllowed(): boolean {
  if (import.meta.env.VITE_ENABLE_TEST_MODE !== "true") {
    return false;
  }

  // If already activated this tab session, allow
  if (sessionStorage.getItem(SESSION_FLAG_KEY) === "true") {
    return true;
  }

  // Check URL query parameter for a test key (value is validated server-side)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("test_key");
    if (urlKey && urlKey.length >= 8) {
      // Store the key in sessionStorage so the dialog can send it to the server
      sessionStorage.setItem(SESSION_KEY_KEY, urlKey);
      sessionStorage.setItem(SESSION_FLAG_KEY, "true");
      return true;
    }
  }

  return false;
}

/**
 * Returns the test key stored in sessionStorage (for sending to the edge function).
 */
export function getTestKey(): string | null {
  return sessionStorage.getItem(SESSION_KEY_KEY);
}

/**
 * Returns true when a test mode session is active (for banner display).
 */
export function isTestModeActive(): boolean {
  return sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
}
