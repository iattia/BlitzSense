const LOCAL_ERROR_KEY = 'blitzsense_recent_errors';

export function reportError(error: unknown, context: string): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const record = {
    context,
    message: normalized.message,
    stack: normalized.stack?.slice(0, 4000),
    occurredAt: new Date().toISOString(),
    version: import.meta.env.VITE_APP_VERSION ?? 'development',
  };
  console.error(`[BlitzSense] ${context}`, normalized);
  try {
    const previous = JSON.parse(localStorage.getItem(LOCAL_ERROR_KEY) ?? '[]') as unknown[];
    localStorage.setItem(LOCAL_ERROR_KEY, JSON.stringify([record, ...previous].slice(0, 20)));
  } catch { /* storage unavailable */ }

  const endpoint = import.meta.env.VITE_ERROR_REPORT_URL;
  if (endpoint) {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(() => undefined);
  }
}
