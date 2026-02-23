import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SalesforceService } from '@/services/salesforce.js'
import { resetConfig } from '@/config/index.js'
import type { StagingInvolvementRecord } from '@/types/salesforce.js'

vi.mock('jsforce', () => {
  const mockInsert = vi.fn()
  const mockSobject = vi.fn(() => ({ insert: mockInsert }))
  const MockConnection = vi.fn(() => ({ sobject: mockSobject }))
  return {
    default: { Connection: MockConnection },
    Connection: MockConnection,
    __mockInsert: mockInsert,
    __mockSobject: mockSobject,
  }
})

describe('SalesforceService', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com/rest'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.salesforce.com'
    process.env.SF_CLIENT_ID = 'test-client-id'
    process.env.SF_CLIENT_SECRET = 'test-client-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    process.env.SF_BATCH_SIZE = '200'
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetConfig()
    vi.clearAllMocks()
  })

  function mockAuthFetch() {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'test-token',
        instance_url: 'https://test.my.salesforce.com',
      }),
    })
  }

  it('authenticates with client_credentials grant type', async () => {
    mockAuthFetch()

    const svc = new SalesforceService()
    await svc.getConnection()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.salesforce.com/services/oauth2/token',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('caches connection', async () => {
    mockAuthFetch()

    const svc = new SalesforceService()
    const conn1 = await svc.getConnection()
    const conn2 = await svc.getConnection()

    expect(conn1).toBe(conn2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on auth failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })

    const svc = new SalesforceService()
    await expect(svc.getConnection()).rejects.toThrow('SF auth failed')
  })

  it('returns empty result for empty records', async () => {
    mockAuthFetch()

    const svc = new SalesforceService()
    const result = await svc.insertStagingRecords([])

    expect(result).toEqual({ successCount: 0, errorCount: 0, errors: [] })
  })

  it('inserts records in batches', async () => {
    mockAuthFetch()
    const { __mockInsert } = await import('jsforce') as unknown as { __mockInsert: ReturnType<typeof vi.fn> }
    __mockInsert.mockResolvedValue([
      { success: true, id: 'a1' },
      { success: true, id: 'a2' },
    ])

    const svc = new SalesforceService()
    const records: StagingInvolvementRecord[] = [
      makeMinimalRecord('r1'),
      makeMinimalRecord('r2'),
    ]

    const result = await svc.insertStagingRecords(records)

    expect(result.successCount).toBe(2)
    expect(result.errorCount).toBe(0)
  })

  it('counts errors from failed inserts', async () => {
    mockAuthFetch()
    const { __mockInsert } = await import('jsforce') as unknown as { __mockInsert: ReturnType<typeof vi.fn> }
    __mockInsert.mockResolvedValue([
      { success: true, id: 'a1' },
      { success: false, errors: [{ message: 'Required field missing' }] },
    ])

    const svc = new SalesforceService()
    const records = [makeMinimalRecord('r1'), makeMinimalRecord('r2')]

    const result = await svc.insertStagingRecords(records)

    expect(result.successCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0].message).toBe('Required field missing')
  })
})

function makeMinimalRecord(id: string): StagingInvolvementRecord {
  return {
    Status__c: 'Ready to Process',
    Staging_Type__c: 'Registration',
    Source__c: 'ERT',
    Involvement_External_Id__c: `ERTREG-${id}`,
    Contact_External_Id__c: `ERTPER-${id}`,
    Event_External_Id__c: `ERTCON-${id}`,
    Last_Name__c: 'Test',
    Involvement_Status__c: 'Registered',
    Registrant_Type__c: 'Couple',
    Event_Id__c: 'WTR26TEST',
  }
}
