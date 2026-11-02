/**
 * Sanitized, structured logger that prevents credential and sensitive data leakage.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
  errorName?: string
  errorMessage?: string
}

const SENSITIVE_KEY_PATTERN = /(?:key|token|auth|secret|credential|password|signature)/i

/**
 * Recursively sanitizes object payloads to redact sensitive credentials, API keys, or tokens.
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 4) return '[Max Depth]'
  if (data === null || data === undefined) return data
  if (typeof data !== 'object') return data

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1))
  }

  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      clean[k] = '[REDACTED]'
    } else if (typeof v === 'string' && /^(https?:\/\/[^\s]+)$/.test(v)) {
      try {
        const u = new URL(v)
        for (const param of Array.from(u.searchParams.keys())) {
          if (SENSITIVE_KEY_PATTERN.test(param)) {
            u.searchParams.set(param, '[REDACTED]')
          }
        }
        clean[k] = u.toString()
      } catch {
        clean[k] = v
      }
    } else {
      clean[k] = sanitizeLogData(v, depth + 1)
    }
  }
  return clean
}

export const logger = {
  log(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    }

    if (context) {
      entry.context = sanitizeLogData(context) as Record<string, unknown>
    }

    if (err instanceof Error) {
      entry.errorName = err.name
      entry.errorMessage = err.message
    }

    return entry
  },
  warn(message: string, context?: Record<string, unknown>, err?: unknown): LogEntry {
    return this.log('warn', message, context, err)
  },
  error(message: string, context?: Record<string, unknown>, err?: unknown): LogEntry {
    return this.log('error', message, context, err)
  },
  info(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log('info', message, context)
  },
  debug(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log('debug', message, context)
  },
}
