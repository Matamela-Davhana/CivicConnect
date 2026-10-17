const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

let authToken = null

export function setAuthToken(token) {
  authToken = token
}

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

const FALLBACK_MESSAGES = {
  400: 'The request could not be understood. Check what you entered and try again.',
  401: 'Your session has expired. Sign in again to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  422: 'Some of the information you entered needs fixing.',
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, 'We could not reach the server. Check your connection and try again.')
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? 'The server ran into a problem. Try again in a moment.'
        : (FALLBACK_MESSAGES[response.status] ?? 'Something went wrong. Try again.')
    throw new ApiError(response.status, payload?.message ?? fallback, payload?.errors ?? null)
  }
  return payload
}
