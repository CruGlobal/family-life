import { describe, it, expect, vi } from 'vitest'

vi.mock('rollbar', () => {
  const mockRollbar = {
    error: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(null)
    }),
    warning: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(null)
    }),
    info: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(null)
    }),
  }
  return { default: vi.fn(() => mockRollbar) }
})

describe('rollbar', () => {
  it('exports error, warning, and info methods', async () => {
    const { default: rollbar } = await import('@/config/rollbar.js')

    expect(rollbar.error).toBeDefined()
    expect(rollbar.warning).toBeDefined()
    expect(rollbar.info).toBeDefined()
  })

  it('error returns a promise', async () => {
    const { default: rollbar } = await import('@/config/rollbar.js')

    const result = rollbar.error('test error')
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('warning returns a promise', async () => {
    const { default: rollbar } = await import('@/config/rollbar.js')

    const result = rollbar.warning('test warning')
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('info returns a promise', async () => {
    const { default: rollbar } = await import('@/config/rollbar.js')

    const result = rollbar.info('test info')
    expect(result).toBeInstanceOf(Promise)
    await result
  })
})
