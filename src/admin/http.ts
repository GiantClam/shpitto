export class AdminHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminHttpError';
    this.status = status;
  }
}

/** Keep the HTTP status: React-admin uses it to discard revoked permissions. */
export async function adminRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {...options, credentials: 'same-origin', cache: 'no-store'});
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as {error?: string | {message?: string}} | null)?.error;
    throw new AdminHttpError(typeof error === 'string' ? error : error?.message ?? 'The operation could not be completed.', response.status);
  }
  if (payload === null) throw new AdminHttpError('The service returned an invalid response.', 502);
  return payload as T;
}
