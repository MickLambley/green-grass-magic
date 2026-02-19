/**
 * TEST MODE - Secure activation via URL query parameter + secret key.
 *
 * Security:
 * 1. URL must contain ?test_key=<value> matching the secret
 * 2. VITE_ENABLE_TEST_MODE must be "true"
 * 3. sessionStorage flag limits activation to the current tab
 */

const SESSION_FLAG_KEY = "testModeActive";

/**
 * Returns true when the test mode button should be shown on the auth page.
 */
export function isTestModeAllowed(): boolean {
  if (import.meta.env.VITE_ENABLE_TEST_MODE !== "true") {
    return false;
  }

  const secretKey = "G8ZSXNxsdymav5E";

  // If already activated this tab session, allow
  if (sessionStorage.getItem(SESSION_FLAG_KEY) === "true") {
    return true;
  }

  // Check URL query parameter
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("test_key");
    if (urlKey && urlKey === secretKey) {
      sessionStorage.setItem(SESSION_FLAG_KEY, "true");
      return true;
    }
  }

  return false;
}

/**
 * Returns true when a test mode session is active (for banner display).
 */
export function isTestModeActive(): boolean {
  return sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
}
