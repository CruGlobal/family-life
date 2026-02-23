export interface LogContext {
  conferenceId?: string
  registrationId?: string
  action?: string
  [key: string]: unknown
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  }
  return JSON.stringify(entry)
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(formatLog('debug', message, context))
    }
  },

  info(message: string, context?: LogContext): void {
    console.log(formatLog('info', message, context))
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatLog('warn', message, context))
  },

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }
    console.error(formatLog('error', message, errorContext))
  }
}
