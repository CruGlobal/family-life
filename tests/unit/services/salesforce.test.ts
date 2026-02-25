import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SalesforceService } from '@/services/salesforce.js'
import { resetConfig } from '@/config/index.js'
import type { StagingInvolvementRecord, CompositeResponse } from '@/types/salesforce.js'

const mockRequestPost = vi.fn()

vi.mock('jsforce', () => {
  const MockConnection = vi.fn(() => ({
    version: '62.0',
    requestPost: mockRequestPost,
  }))
  return {
    default: { Connection: MockConnection },
    Connection: MockConnection,
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

  function makeSuccessResponse(recordCount: number, batchSize = 200): CompositeResponse {
    const batchCount = Math.ceil(recordCount / batchSize)
    const compositeResponse = []

    for (let b = 0; b < batchCount; b++) {
      const size = Math.min(batchSize, recordCount - b * batchSize)
      const body = Array.from({ length: size }, (_, i) => ({
        id: `a${b * batchSize + i + 1}`,
        success: true as const,
        errors: [] as Array<{ message: string; statusCode: string }>,
      }))
      compositeResponse.push({
        body,
        httpHeaders: {},
        httpStatusCode: 200,
        referenceId: `batch_${b}`,
      })
    }

    return { compositeResponse }
  }

  function makeFailureResponse(): CompositeResponse {
    return {
      compositeResponse: [{
        body: [
          {
            id: null,
            success: false,
            errors: [{ message: 'Required field missing', statusCode: 'REQUIRED_FIELD_MISSING' }],
          },
        ],
        httpHeaders: {},
        httpStatusCode: 400,
        referenceId: 'batch_0',
      }],
    }
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

  it('sends correct Composite API payload with SObject Collections', async () => {
    mockAuthFetch()
    mockRequestPost.mockResolvedValue(makeSuccessResponse(2))

    const svc = new SalesforceService()
    const records = [makeMinimalRecord('r1'), makeMinimalRecord('r2')]
    await svc.insertStagingRecords(records)

    expect(mockRequestPost).toHaveBeenCalledTimes(1)
    const [url, payload] = mockRequestPost.mock.calls[0]

    expect(url).toBe('/services/data/v62.0/composite')
    expect(payload.allOrNone).toBe(true)
    expect(payload.compositeRequest).toHaveLength(1)

    const subreq = payload.compositeRequest[0]
    expect(subreq.method).toBe('POST')
    expect(subreq.url).toBe('/services/data/v62.0/composite/sobjects')
    expect(subreq.body.allOrNone).toBe(true)
    expect(subreq.body.records).toHaveLength(2)
    expect(subreq.body.records[0].attributes.type).toBe('Staging_Involvement__c')
    expect(subreq.body.records[0].Last_Name__c).toBe('Test')
  })

  it('counts successes from response', async () => {
    mockAuthFetch()
    mockRequestPost.mockResolvedValue(makeSuccessResponse(2))

    const svc = new SalesforceService()
    const records = [makeMinimalRecord('r1'), makeMinimalRecord('r2')]
    const result = await svc.insertStagingRecords(records)

    expect(result.successCount).toBe(2)
    expect(result.errorCount).toBe(0)
  })

  it('throws on failure (atomic rollback)', async () => {
    mockAuthFetch()
    mockRequestPost.mockResolvedValue(makeFailureResponse())

    const svc = new SalesforceService()
    const records = [makeMinimalRecord('r1')]

    await expect(svc.insertStagingRecords(records)).rejects.toThrow(
      'Composite insert failed (all records rolled back): Required field missing'
    )
  })

  it('throws when record count exceeds 1,000', async () => {
    mockAuthFetch()

    const svc = new SalesforceService()
    const records = Array.from({ length: 1_001 }, (_, i) => makeMinimalRecord(`r${i}`))

    await expect(svc.insertStagingRecords(records)).rejects.toThrow(
      'Cannot atomically insert 1001 records'
    )
    expect(mockRequestPost).not.toHaveBeenCalled()
  })

  it('batches records into multiple subrequests', async () => {
    mockAuthFetch()
    process.env.SF_BATCH_SIZE = '200'
    resetConfig()

    mockRequestPost.mockResolvedValue(makeSuccessResponse(450))

    const svc = new SalesforceService()
    const records = Array.from({ length: 450 }, (_, i) => makeMinimalRecord(`r${i}`))
    const result = await svc.insertStagingRecords(records)

    const [, payload] = mockRequestPost.mock.calls[0]
    const subrequests = payload.compositeRequest

    expect(subrequests).toHaveLength(3)
    expect(subrequests[0].body.records).toHaveLength(200)
    expect(subrequests[1].body.records).toHaveLength(200)
    expect(subrequests[2].body.records).toHaveLength(50)
    expect(subrequests[0].referenceId).toBe('batch_0')
    expect(subrequests[1].referenceId).toBe('batch_1')
    expect(subrequests[2].referenceId).toBe('batch_2')
    expect(result.successCount).toBe(450)
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
