/**
 * Browser-side API helper.
 *
 * Always calls the same-origin `/api/...` BFF proxy, which injects the access
 * token from the httpOnly cookie and refreshes it when needed — so nothing here
 * ever touches a JWT.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = (() => {
      if (typeof data === 'object' && data !== null && 'message' in data) {
        const raw = (data as { message: unknown }).message;
        if (Array.isArray(raw)) return raw.join(', ');
        if (typeof raw === 'string') return raw;
      }
      return `Request failed (${response.status})`;
    })();
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => fetch(path, { cache: 'no-store' }).then(parse<T>),

  post: <T>(path: string, body: unknown) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(parse<T>),

  patch: <T>(path: string, body: unknown) =>
    fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(parse<T>),

  delete: <T>(path: string) => fetch(path, { method: 'DELETE' }).then(parse<T>),

  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(path, { method: 'POST', body: form }).then(parse<T>);
  },
};
