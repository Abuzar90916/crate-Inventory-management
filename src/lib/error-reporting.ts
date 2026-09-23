// Simple error reporting utility.
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  console.error('[Error]', context, error);
}
