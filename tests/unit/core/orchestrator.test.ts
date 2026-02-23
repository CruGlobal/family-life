import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runSync } from '@/core/orchestrator.js'
import { resetConfig } from '@/config/index.js'
import type { Services } from '@/services/index.js'

describe('runSync', () => {
  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com'
    process.env.ERT_API_KEY = 'test-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
    process.env.ERT_MINISTRY_NAME = 'Family Life'
    process.env.ERT_ACTIVITY_NAME = 'WTR'
  })

  afterEach(() => {
    resetConfig()
  })

  function makeServices(overrides: Partial<{
    ministries: unknown[]
    conferences: unknown[]
    conferenceDetail: unknown
    registrations: unknown[]
    insertResult: { successCount: number; errorCount: number; errors: never[] }
    lastImportDate: string
  }> = {}): Services {
    const ministries = overrides.ministries ?? [
      {
        id: 'm-1',
        name: 'Family Life',
        activities: [{ id: 'a-wtr', name: 'WTR' }],
      },
    ]
    const conferences = overrides.conferences ?? [
      {
        id: 'c-1',
        name: 'WTR Lincoln',
        abbreviation: 'WTR26LNK1',
        archived: false,
        ministry: 'm-1',
        ministryActivity: 'a-wtr',
        eventType: '0f87dff6-0115-4d86-8bc7-5e785334b3e2',
        eventStartTime: '2026-03-15T18:00:00',
        eventEndTime: '2026-03-17T12:00:00',
      },
    ]
    const detail = overrides.conferenceDetail ?? {
      id: 'c-1',
      name: 'WTR Lincoln',
      abbreviation: 'WTR26LNK1',
      archived: false,
      ministry: 'm-1',
      ministryActivity: 'a-wtr',
      eventType: '0f87dff6-0115-4d86-8bc7-5e785334b3e2',
      eventStartTime: '2026-03-15T18:00:00',
      eventEndTime: '2026-03-17T12:00:00',
      locationName: 'Marriott',
      contactPersonName: 'John',
      contactPersonEmail: 'j@cru.org',
      registrationPages: [{ id: 'p1', blocks: [] }],
      registrantTypes: [{ id: 'rt-1', name: 'Couple' }],
    }
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
        getMinistries: vi.fn().mockResolvedValue(ministries),
        getConferences: vi.fn().mockResolvedValue(conferences),
        getConferenceDetail: vi.fn().mockResolvedValue(detail),
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
    const result = await runSync(services)

    expect(result.conferencesFound).toBe(1)
    expect(result.conferencesProcessed).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(services.ssm.getLastImportDate).toHaveBeenCalled()
    expect(services.ssm.updateLastImportDate).toHaveBeenCalledWith(result.runStartTime)
  })

  it('throws when ministry not found', async () => {
    const services = makeServices({
      ministries: [{ id: 'm-1', name: 'OtherMinistry', activities: [] }],
    })

    await expect(runSync(services)).rejects.toThrow('Ministry "Family Life" not found')
  })

  it('throws when ministry has no activities', async () => {
    const services = makeServices({
      ministries: [{ id: 'm-1', name: 'Family Life', activities: [] }],
    })

    await expect(runSync(services)).rejects.toThrow('has no activities')
  })

  it('throws when WTR activity not found', async () => {
    const services = makeServices({
      ministries: [
        { id: 'm-1', name: 'Family Life', activities: [{ id: 'a-other', name: 'Other' }] },
      ],
    })

    await expect(runSync(services)).rejects.toThrow('Activity "WTR" not found')
  })

  it('filters out archived conferences', async () => {
    const services = makeServices({
      conferences: [
        {
          id: 'c-1',
          name: 'Active WTR',
          archived: false,
          ministryActivity: 'a-wtr',
          eventType: 'et-1',
        },
        {
          id: 'c-2',
          name: 'Archived WTR',
          archived: true,
          ministryActivity: 'a-wtr',
          eventType: 'et-1',
        },
      ],
    })

    const result = await runSync(services)
    expect(result.conferencesFound).toBe(1)
  })

  it('filters out non-WTR conferences', async () => {
    const services = makeServices({
      conferences: [
        {
          id: 'c-1',
          name: 'WTR conf',
          archived: false,
          ministryActivity: 'a-wtr',
          eventType: 'et-1',
        },
        {
          id: 'c-2',
          name: 'Other conf',
          archived: false,
          ministryActivity: 'a-other',
          eventType: 'et-1',
        },
      ],
    })

    const result = await runSync(services)
    expect(result.conferencesFound).toBe(1)
  })

  it('isolates conference failures with Promise.allSettled', async () => {
    const services = makeServices({
      conferences: [
        {
          id: 'c-1',
          name: 'Good conf',
          archived: false,
          ministryActivity: 'a-wtr',
          eventType: 'et-1',
        },
        {
          id: 'c-2',
          name: 'Bad conf',
          archived: false,
          ministryActivity: 'a-wtr',
          eventType: 'et-1',
        },
      ],
    })

    // First call succeeds, second fails
    let callCount = 0
    ;(services.ert.getConferenceDetail as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.reject(new Error('API timeout'))
      }
      return Promise.resolve({
        id: 'c-1',
        name: 'Good conf',
        abbreviation: 'WTR26G',
        eventType: 'et-1',
        eventStartTime: '',
        eventEndTime: '',
        locationName: '',
        contactPersonName: '',
        contactPersonEmail: '',
        registrationPages: [{ id: 'p1', blocks: [] }],
        registrantTypes: [{ id: 'rt-1', name: 'Couple' }],
      })
    })

    const result = await runSync(services)

    expect(result.conferencesProcessed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('API timeout')
    // SSM should still be updated
    expect(services.ssm.updateLastImportDate).toHaveBeenCalled()
  })

  it('updates lastImportDate to run start time', async () => {
    const services = makeServices()
    const result = await runSync(services)

    expect(services.ssm.updateLastImportDate).toHaveBeenCalledWith(result.runStartTime)
    // runStartTime should be a valid ISO string
    expect(new Date(result.runStartTime).toISOString()).toBe(result.runStartTime)
  })
})
