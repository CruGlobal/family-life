import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runRegistrationsToSF } from '@/core/orchestrator.js'
import { resetConfig } from '@/config/index.js'
import type { Services } from '@/services/index.js'

describe('runRegistrationsToSF', () => {
  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    process.env.ERT_MINISTRY_ID = '9f63db46-6ca9-43b0-868a-23326b3c4d91'
    process.env.ERT_ACTIVITY_ID = '9c6eae3f-8928-4703-a2a4-e5bf995dfd19'
  })

  afterEach(() => {
    resetConfig()
  })

  const defaultDetail = {
    id: 'c-1',
    name: 'WTR Lincoln',
    abbreviation: 'WTR26LNK1',
    archived: false,
    ministry: '9f63db46-6ca9-43b0-868a-23326b3c4d91',
    ministryActivity: '9c6eae3f-8928-4703-a2a4-e5bf995dfd19',
    eventType: '0f87dff6-0115-4d86-8bc7-5e785334b3e2',
    eventStartTime: '2026-03-15T18:00:00',
    eventEndTime: '2026-03-17T12:00:00',
    locationName: 'Marriott',
    contactPersonName: 'John',
    contactPersonEmail: 'j@cru.org',
    registrationPages: [{ id: 'p1', blocks: [] }],
    registrantTypes: [{ id: 'rt-1', name: 'Couple' }],
  }

  function makeServices(overrides: Partial<{
    conferenceIds: string[]
    conferenceDetails: Record<string, unknown>
    registrations: unknown[]
    insertResult: { successCount: number; errorCount: number; errors: never[] }
    lastImportDate: string
  }> = {}): Services {
    const conferenceIds = overrides.conferenceIds ?? ['c-1']
    const detailMap = overrides.conferenceDetails ?? { 'c-1': defaultDetail }
    const registrations = overrides.registrations ?? [
      {
        id: 'r-1',
        conferenceId: 'c-1',
        primaryRegistrantId: 'rg-1',
        completed: true,
        completedTimestamp: '2026-02-01T10:00:00Z',
        lastUpdatedTimestamp: '2026-02-01T10:00:00Z',
        totalPaid: 199,
        remainingBalance: 0,
        pastPayments: [],
        promotions: [],
        registrants: [
          {
            id: 'rg-1',
            registrantTypeId: 'rt-1',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@test.com',
            withdrawn: false,
            withdrawnTimestamp: null,
            checkedInTimestamp: null,
            eformStatus: null,
            answers: [],
          },
        ],
      },
    ]

    return {
      ert: {
        getConferenceIds: vi.fn().mockResolvedValue(conferenceIds),
        getConferenceDetail: vi.fn().mockImplementation((id: string) => {
          const detail = detailMap[id]
          return detail ? Promise.resolve(detail) : Promise.reject(new Error(`Not found: ${id}`))
        }),
        getRegistrations: vi.fn(),
        getAllRegistrations: vi.fn().mockResolvedValue(registrations),
      },
      salesforce: {
        getConnection: vi.fn(),
        insertStagingRecords: vi.fn().mockResolvedValue(
          overrides.insertResult ?? { successCount: 1, errorCount: 0, errors: [] }
        ),
      },
      ssm: {
        getLastImportDate: vi.fn().mockResolvedValue(
          overrides.lastImportDate ?? '2026-02-01T00:00:00Z'
        ),
        updateLastImportDate: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Services
  }

  it('runs full sync pipeline', async () => {
    const services = makeServices()
    const result = await runRegistrationsToSF(services)

    expect(result.conferencesFound).toBe(1)
    expect(result.conferencesProcessed).toBe(1)
    expect(result.totalRecords).toBe(1)
    expect(result.insertResult.successCount).toBe(1)
    expect(services.ssm.getLastImportDate).toHaveBeenCalled()
    expect(services.ssm.updateLastImportDate).toHaveBeenCalledWith(result.runStartTime)
  })

  it('aborts entire run when any conference gather fails', async () => {
    const goodDetail = { ...defaultDetail, id: 'c-1', name: 'Good conf' }
    const badDetail = { ...defaultDetail, id: 'c-2', name: 'Bad conf' }

    const services = makeServices({
      conferenceIds: ['c-1', 'c-2'],
      conferenceDetails: {
        'c-1': goodDetail,
        'c-2': badDetail,
      },
    })

    let regCallCount = 0
    ;(services.ert.getAllRegistrations as ReturnType<typeof vi.fn>).mockImplementation(() => {
      regCallCount++
      if (regCallCount === 2) {
        return Promise.reject(new Error('API timeout'))
      }
      return Promise.resolve([{
        id: 'r-1',
        conferenceId: 'c-1',
        primaryRegistrantId: 'rg-1',
        completed: true,
        registrants: [{
          id: 'rg-1',
          registrantTypeId: 'rt-1',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          withdrawn: false,
          withdrawnTimestamp: null,
          checkedInTimestamp: null,
          eformStatus: null,
          answers: [],
        }],
      }])
    })

    await expect(runRegistrationsToSF(services)).rejects.toThrow('Gather failed for 1 conference(s)')

    // No SF insert should happen
    expect(services.salesforce.insertStagingRecords).not.toHaveBeenCalled()
    // Cursor should NOT advance
    expect(services.ssm.updateLastImportDate).not.toHaveBeenCalled()
  })

  it('aborts when SF insert fails — cursor stays put', async () => {
    const services = makeServices()
    ;(services.salesforce.insertStagingRecords as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Composite Graph insert failed (all records rolled back): FIELD_CUSTOM_VALIDATION_EXCEPTION')
    )

    await expect(runRegistrationsToSF(services)).rejects.toThrow('Composite Graph insert failed')
    expect(services.ssm.updateLastImportDate).not.toHaveBeenCalled()
  })

  it('combines records from multiple conferences into one insert call', async () => {
    const detail1 = { ...defaultDetail, id: 'c-1', name: 'WTR Lincoln' }
    const detail2 = { ...defaultDetail, id: 'c-2', name: 'WTR Denver' }

    const services = makeServices({
      conferenceIds: ['c-1', 'c-2'],
      conferenceDetails: { 'c-1': detail1, 'c-2': detail2 },
      insertResult: { successCount: 2, errorCount: 0, errors: [] as never[] },
    })

    const result = await runRegistrationsToSF(services)

    expect(services.salesforce.insertStagingRecords).toHaveBeenCalledTimes(1)
    const insertedRecords = (services.salesforce.insertStagingRecords as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRecords).toHaveLength(2)
    expect(result.totalRecords).toBe(2)
    expect(result.conferencesProcessed).toBe(2)
  })

  it('updates lastImportDate to run start time', async () => {
    const services = makeServices()
    const result = await runRegistrationsToSF(services)

    expect(services.ssm.updateLastImportDate).toHaveBeenCalledWith(result.runStartTime)
    expect(new Date(result.runStartTime).toISOString()).toBe(result.runStartTime)
  })

  it('continues processing when some conference details fail to fetch', async () => {
    const services = makeServices({
      conferenceIds: ['c-1', 'c-bad'],
      conferenceDetails: { 'c-1': defaultDetail }, // 'c-bad' is absent → rejects
    })

    const result = await runRegistrationsToSF(services)

    expect(result.conferencesFound).toBe(1)
    expect(result.conferencesProcessed).toBe(1)
    expect(result.totalRecords).toBe(1)
    expect(services.ssm.updateLastImportDate).toHaveBeenCalled()
  })

  it('skips SF insert for zero records but still advances cursor', async () => {
    const services = makeServices({ registrations: [] })
    ;(services.salesforce.insertStagingRecords as ReturnType<typeof vi.fn>).mockResolvedValue(
      { successCount: 0, errorCount: 0, errors: [] }
    )

    const result = await runRegistrationsToSF(services)

    expect(result.totalRecords).toBe(0)
    expect(services.salesforce.insertStagingRecords).toHaveBeenCalledWith([])
    expect(services.ssm.updateLastImportDate).toHaveBeenCalled()
  })
})
