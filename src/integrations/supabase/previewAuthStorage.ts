// Standard localStorage-based auth storage for Supabase.
// Returns localStorage for browser environments, undefined for SSR.
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return localStorage;
}
