import { supabase } from "@/integrations/supabase/client";

/**
 * Get a signed URL for a lawn image stored in the lawn-images bucket.
 * Handles both legacy full public URLs and new path-only values.
 */
export async function getLawnImageSignedUrl(storedValue: string | null): Promise<string | null> {
  if (!storedValue) return null;

  // Extract path from full public URL if needed
  let path = storedValue;
  const publicUrlMarker = "/storage/v1/object/public/lawn-images/";
  const idx = storedValue.indexOf(publicUrlMarker);
  if (idx !== -1) {
    path = storedValue.substring(idx + publicUrlMarker.length);
  }

  const { data, error } = await supabase.storage
    .from("lawn-images")
    .createSignedUrl(path, 3600); // 1 hour expiry

  if (error || !data) {
    console.error("Error creating signed URL for lawn image:", error);
    return null;
  }

  return data.signedUrl;
}
