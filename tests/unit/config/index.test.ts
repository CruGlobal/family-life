import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getConfig, resetConfig } from '@/config/index.js'

describe('config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    resetConfig()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetConfig()
  })

  it('returns config from environment variables', () => {
    process.env.ENVIRONMENT = 'sandbox'
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'

    const config = getConfig()

    expect(config.environment).toBe('sandbox')
    expect(config.ertBaseUrl).toBe('https://api.test.com')
    expect(config.ertApiKey).toBe('test-key')
    expect(config.sfLoginUrl).toBe('https://test.sf.com')
    expect(config.sfClientId).toBe('sf-id')
    expect(config.sfClientSecret).toBe('sf-secret')
    expect(config.ssmLastImportDateParam).toBe('/test/param')
  })

  it('uses default values for optional fields', () => {
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    delete process.env.ENVIRONMENT
    delete process.env.REGISTRATION_PAGE_SIZE
    delete process.env.SF_BATCH_SIZE

    const config = getConfig()

    expect(config.environment).toBe('sandbox')
    expect(config.ertMinistryName).toBe('Family Life')
    expect(config.ertActivityName).toBe('WTR')
    expect(config.registrationPageSize).toBe(100)
    expect(config.sfBatchSize).toBe(200)
  })

  it('parses numeric environment variables', () => {
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    process.env.REGISTRATION_PAGE_SIZE = '50'
    process.env.SF_BATCH_SIZE = '100'

    const config = getConfig()

    expect(config.registrationPageSize).toBe(50)
    expect(config.sfBatchSize).toBe(100)
  })

  it('falls back to default for non-numeric page size', () => {
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    process.env.REGISTRATION_PAGE_SIZE = 'not-a-number'

    const config = getConfig()
    expect(config.registrationPageSize).toBe(100)
  })

  it('throws on missing required env var', () => {
    delete process.env.ERT_BASE_URL
    delete process.env.ERT_API_KEY

    expect(() => getConfig()).toThrow('Missing required environment variable: ERT_BASE_URL')
  })

  it('caches config across calls', () => {
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'

    const config1 = getConfig()
    const config2 = getConfig()

    expect(config1).toBe(config2)
  })

  it('resets cached config', () => {
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'

    const config1 = getConfig()
    resetConfig()

    process.env.ERT_BASE_URL = 'https://api.other.com'
    const config2 = getConfig()

    expect(config1).not.toBe(config2)
    expect(config2.ertBaseUrl).toBe('https://api.other.com')
  })
})
