import { describe, it, expect, vi } from 'vitest'
import { processConference } from '@/core/conference-processor.js'
import { makeConferenceSummary, makeConferenceDetail } from '../../fixtures/conferences.js'
import { makeRegistration, makeRegistrant } from '../../fixtures/registrations.js'
import type { Services } from '@/services/index.js'

function mockServices(overrides: Partial<{
  conferenceDetail: ReturnType<typeof makeConferenceDetail>
  registrations: ReturnType<typeof makeRegistration>[]
  insertResult: { successCount: number; errorCount: number; errors: never[] }
}> = {}): Services {
  const detail = overrides.conferenceDetail ?? makeConferenceDetail()
  const registrations = overrides.registrations ?? [makeRegistration()]
  const insertResult = overrides.insertResult ?? { successCount: 1, errorCount: 0, errors: [] }

  return {
    ert: {
      getMinistries: vi.fn(),
      getConferences: vi.fn(),
      getConferenceDetail: vi.fn().mockResolvedValue(detail),
      getRegistrations: vi.fn(),
      getAllRegistrations: vi.fn().mockResolvedValue(registrations),
    },
    salesforce: {
      getConnection: vi.fn(),
      insertStagingRecords: vi.fn().mockResolvedValue(insertResult),
    },
    ssm: {
      getLastImportDate: vi.fn(),
      updateLastImportDate: vi.fn(),
    },
  } as unknown as Services
}

describe('processConference', () => {
  it('fetches conference detail and registrations', async () => {
    const services = mockServices()
    const conf = makeConferenceSummary()

    await processConference(conf, '2026-01-01T00:00:00Z', services)

    expect(services.ert.getConferenceDetail).toHaveBeenCalledWith('conf-001')
    expect(services.ert.getAllRegistrations).toHaveBeenCalledWith(
      'conf-001',
      '2026-01-01T00:00:00Z',
      undefined
    )
  })

  it('transforms and inserts registrants', async () => {
    const registrations = [
      makeRegistration({
        registrants: [
          makeRegistrant({ id: 'r1', firstName: 'Jane', lastName: 'Doe' }),
          makeRegistrant({ id: 'r2', firstName: 'John', lastName: 'Doe' }),
        ],
      }),
    ]
    const services = mockServices({
      registrations,
      insertResult: { successCount: 2, errorCount: 0, errors: [] },
    })

    const result = await processConference(
      makeConferenceSummary(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(2)
    expect(result.registrantsSkipped).toBe(0)
    expect(services.salesforce.insertStagingRecords).toHaveBeenCalledTimes(1)
  })

  it('skips registrants without names', async () => {
    const registrations = [
      makeRegistration({
        registrants: [
          makeRegistrant({ id: 'r1', firstName: null, lastName: null, answers: [] }),
          makeRegistrant({ id: 'r2', firstName: 'Jane', lastName: 'Smith' }),
        ],
      }),
    ]
    const services = mockServices({ registrations })

    const result = await processConference(
      makeConferenceSummary(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(1)
    expect(result.registrantsSkipped).toBe(1)
  })

  it('skips incomplete registrations', async () => {
    const registrations = [
      makeRegistration({
        completed: false,
        registrants: [makeRegistrant()],
      }),
    ]
    const services = mockServices({ registrations })

    const result = await processConference(
      makeConferenceSummary(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(0)
    expect(result.registrantsSkipped).toBe(1)
  })

  it('returns conference metadata in result', async () => {
    const services = mockServices()
    const result = await processConference(
      makeConferenceSummary(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.conferenceId).toBe('conf-001')
    expect(result.conferenceName).toBe('WTR26 Lincoln')
  })

  it('handles empty registrations list', async () => {
    const services = mockServices({ registrations: [] })
    const result = await processConference(
      makeConferenceSummary(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrationsFound).toBe(0)
    expect(result.registrantsProcessed).toBe(0)
    expect(services.salesforce.insertStagingRecords).toHaveBeenCalledWith([])
  })
})
