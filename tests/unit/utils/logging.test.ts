import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '@/utils/logging.js'

describe('logger', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('info outputs structured JSON', () => {
    logger.info('test message', { conferenceId: 'conf-1' })

    expect(console.log).toHaveBeenCalledTimes(1)
    const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(output.level).toBe('info')
    expect(output.message).toBe('test message')
    expect(output.conferenceId).toBe('conf-1')
    expect(output.timestamp).toBeDefined()
  })

  it('warn outputs to console.warn', () => {
    logger.warn('warning message')

    expect(console.warn).toHaveBeenCalledTimes(1)
    const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(output.level).toBe('warn')
    expect(output.message).toBe('warning message')
  })

  it('error includes error details', () => {
    const err = new Error('something broke')
    logger.error('error message', err, { action: 'test' })

    expect(console.error).toHaveBeenCalledTimes(1)
    const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(output.level).toBe('error')
    expect(output.message).toBe('error message')
    expect(output.error.name).toBe('Error')
    expect(output.error.message).toBe('something broke')
    expect(output.action).toBe('test')
  })

  it('error handles non-Error objects', () => {
    logger.error('error message', 'string error')

    const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(output.error).toBe('string error')
  })

  it('debug only logs when LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'info'
    logger.debug('debug message')
    expect(console.log).not.toHaveBeenCalled()

    process.env.LOG_LEVEL = 'debug'
    logger.debug('debug message')
    expect(console.log).toHaveBeenCalledTimes(1)
  })

  it('info works without context', () => {
    logger.info('simple message')

    const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(output.message).toBe('simple message')
    expect(output.level).toBe('info')
  })
})
