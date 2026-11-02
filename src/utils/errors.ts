/**
 * Custom error hierarchy separating fatal domain/validation errors
 * from transient network failures eligible for exponential backoff retries.
 */

export class DashboardDomainError extends Error {
  public readonly isFatal = true
  public readonly code: string

  constructor(message: string, code = 'DOMAIN_VALIDATION_ERROR') {
    super(message)
    this.name = 'DashboardDomainError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class TransientNetworkError extends Error {
  public readonly isTransient = true
  public readonly statusCode?: number
  public readonly retryAfterMs?: number

  constructor(message: string, statusCode?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'TransientNetworkError'
    this.statusCode = statusCode
    this.retryAfterMs = retryAfterMs
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Checks whether an unknown error represents an explicit user or system abortion.
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const errorObj = err as { name?: string; message?: string }
  return (
    errorObj.name === 'AbortError' ||
    (typeof errorObj.message === 'string' && errorObj.message.toLowerCase().includes('aborted'))
  )
}
