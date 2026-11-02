import { TransientNetworkError, isAbortError } from './errors.ts'

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  jitter?: boolean
}

/**
 * Executes an asynchronous task with exponential backoff and jitter.
 * AbortErrors immediately terminate execution without retrying.
 * Only transient errors (5xx server errors, network dropouts) trigger retries.
 */
export async function withExponentialBackoff<T>(
  action: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
  signal?: AbortSignal
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const initialDelay = options.initialDelayMs ?? 200
  const maxDelay = options.maxDelayMs ?? 2000
  const factor = options.backoffFactor ?? 2
  const useJitter = options.jitter ?? true

  let attempt = 0
  while (true) {
    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted.')
      abortErr.name = 'AbortError'
      throw abortErr
    }

    try {
      return await action(signal)
    } catch (err: unknown) {
      if (isAbortError(err)) {
        throw err
      }

      const isTransient =
        err instanceof TransientNetworkError ||
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch'))

      if (!isTransient || attempt >= maxRetries) {
        throw err
      }

      attempt++
      let delay = Math.min(maxDelay, initialDelay * Math.pow(factor, attempt - 1))
      if (useJitter) {
        delay = Math.round(delay * (0.5 + Math.random() * 0.5))
      }

      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined

        const onAbort = () => {
          if (timer !== undefined) clearTimeout(timer)
          const abortErr = new Error('The operation was aborted.')
          abortErr.name = 'AbortError'
          reject(abortErr)
        }

        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, delay)

        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
}
