import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetConfig } from '@/config/index.js'

vi.mock('@/core/orchestrator.js', () => ({
  runRegistrationsToSF: vi.fn(),
}))

vi.mock('@/services/index.js', () => ({
  createServices: vi.fn(() => ({
    ert: {},
    salesforce: {},
    ssm: {},
  })),
}))

vi.mock('@/config/rollbar.js', () => ({
  default: {
    error: vi.fn().mockResolvedValue(undefined),
    warning: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('registrationsToSF handler', () => {
  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
  })

  afterEach(() => {
    resetConfig()
    vi.clearAllMocks()
  })

  it('calls runRegistrationsToSF with created services', async () => {
    const { runRegistrationsToSF } = await import('@/core/orchestrator.js')
    ;(runRegistrationsToSF as ReturnType<typeof vi.fn>).mockResolvedValue({
      conferencesProcessed: 1,
      errors: [],
    })

    const { handler } = await import('@/handlers/registrations-to-sf.js')
    await handler({} as never)

    expect(runRegistrationsToSF).toHaveBeenCalled()
  })

  it('reports warnings to rollbar when there are errors', async () => {
    const { runRegistrationsToSF } = await import('@/core/orchestrator.js')
    ;(runRegistrationsToSF as ReturnType<typeof vi.fn>).mockResolvedValue({
      conferencesProcessed: 1,
      errors: [{ conferenceId: 'c-1', error: 'test error' }],
    })

    const rollbar = (await import('@/config/rollbar.js')).default

    const { handler } = await import('@/handlers/registrations-to-sf.js')
    await handler({} as never)

    expect(rollbar.warning).toHaveBeenCalled()
  })

  it('reports errors to rollbar and re-throws on failure', async () => {
    const { runRegistrationsToSF } = await import('@/core/orchestrator.js')
    ;(runRegistrationsToSF as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Sync failed'))

    const rollbar = (await import('@/config/rollbar.js')).default

    const { handler } = await import('@/handlers/registrations-to-sf.js')
    await expect(handler({} as never)).rejects.toThrow('Sync failed')
    expect(rollbar.error).toHaveBeenCalled()
  })
})
