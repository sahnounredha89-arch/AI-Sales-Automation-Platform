/**
 * Helper to perform authenticated API calls with credentials and Bearer token
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const options: RequestInit = { ...(init || {}) };
  options.credentials = options.credentials || 'include';

  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
  if (token) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    options.headers = headers;
  }

  return fetch(input, options);
}
