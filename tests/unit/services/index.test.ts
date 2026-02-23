import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetConfig } from '@/config/index.js'

describe('createServices', () => {
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
  })

  it('creates all service instances', async () => {
    const { createServices } = await import('@/services/index.js')
    const services = createServices()

    expect(services.ert).toBeDefined()
    expect(services.salesforce).toBeDefined()
    expect(services.ssm).toBeDefined()
  })
})
