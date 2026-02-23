import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetConfig } from '@/config/index.js'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(() => ({ send: mockSend })),
  GetParameterCommand: vi.fn((input) => ({ input, _type: 'GetParameter' })),
  PutParameterCommand: vi.fn((input) => ({ input, _type: 'PutParameter' })),
}))

describe('SsmService', () => {
  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/lastImportDate'
    mockSend.mockReset()
  })

  afterEach(() => {
    resetConfig()
  })

  it('getLastImportDate returns SSM parameter value', async () => {
    mockSend.mockResolvedValue({
      Parameter: { Value: '2026-02-01T00:00:00Z' },
    })

    const { SsmService } = await import('@/services/ssm.js')
    const svc = new SsmService()
    const result = await svc.getLastImportDate()

    expect(result).toBe('2026-02-01T00:00:00Z')
  })

  it('getLastImportDate falls back to 24h ago on error', async () => {
    mockSend.mockRejectedValue(new Error('Parameter not found'))

    const { SsmService } = await import('@/services/ssm.js')
    const svc = new SsmService()
    const before = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const result = await svc.getLastImportDate()
    const after = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()

    expect(result >= before).toBe(true)
    expect(result <= after).toBe(true)
  })

  it('getLastImportDate falls back when parameter has no value', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: undefined } })

    const { SsmService } = await import('@/services/ssm.js')
    const svc = new SsmService()
    const result = await svc.getLastImportDate()

    // Should be approximately 24h ago
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
    const resultTime = new Date(result).getTime()
    expect(Math.abs(resultTime - twentyFourHoursAgo)).toBeLessThan(5000)
  })

  it('updateLastImportDate writes to SSM', async () => {
    mockSend.mockResolvedValue({})

    const { SsmService } = await import('@/services/ssm.js')
    const svc = new SsmService()
    await svc.updateLastImportDate('2026-02-15T12:00:00Z')

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Name: '/test/lastImportDate',
          Value: '2026-02-15T12:00:00Z',
          Type: 'String',
          Overwrite: true,
        }),
      })
    )
  })
})
