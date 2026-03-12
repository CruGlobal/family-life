import { describe, it, expect, vi } from 'vitest'
import { processConference } from '@/core/conference-processor.js'
import { makeConferenceDetail } from '../../fixtures/conferences.js'
import { makeRegistration, makeRegistrant } from '../../fixtures/registrations.js'
import type { Services } from '@/services/index.js'

function mockServices(overrides: Partial<{
  registrations: ReturnType<typeof makeRegistration>[]
}> = {}): Services {
  const registrations = overrides.registrations ?? [makeRegistration()]

  return {
    ert: {
      getConferenceIds: vi.fn(),
      getConferenceDetail: vi.fn(),
      getRegistrations: vi.fn(),
      getAllRegistrations: vi.fn().mockResolvedValue(registrations),
    },
    salesforce: {
      getConnection: vi.fn(),
      insertStagingRecords: vi.fn(),
    },
    ssm: {
      getLastImportDate: vi.fn(),
      updateLastImportDate: vi.fn(),
    },
  } as unknown as Services
}

describe('processConference', () => {
  it('fetches registrations using the provided detail', async () => {
    const services = mockServices()
    const detail = makeConferenceDetail()

    await processConference(detail, '2026-01-01T00:00:00Z', services)

    expect(services.ert.getConferenceDetail).not.toHaveBeenCalled()
    expect(services.ert.getAllRegistrations).toHaveBeenCalledWith(
      'conf-001',
      '2026-01-01T00:00:00Z',
      undefined
    )
  })

  it('transforms registrants and returns records', async () => {
    const registrations = [
      makeRegistration({
        registrants: [
          makeRegistrant({ id: 'r1', firstName: 'Jane', lastName: 'Doe' }),
          makeRegistrant({ id: 'r2', firstName: 'John', lastName: 'Doe' }),
        ],
      }),
    ]
    const services = mockServices({ registrations })

    const result = await processConference(
      makeConferenceDetail(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(2)
    expect(result.registrantsSkipped).toBe(0)
    expect(result.records).toHaveLength(2)
    expect(services.salesforce.insertStagingRecords).not.toHaveBeenCalled()
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
      makeConferenceDetail(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(1)
    expect(result.registrantsSkipped).toBe(1)
    expect(result.records).toHaveLength(1)
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
      makeConferenceDetail(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrantsProcessed).toBe(0)
    expect(result.registrantsSkipped).toBe(1)
    expect(result.records).toHaveLength(0)
  })

  it('returns conference metadata in result', async () => {
    const services = mockServices()
    const result = await processConference(
      makeConferenceDetail(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.conferenceId).toBe('conf-001')
    expect(result.conferenceName).toBe('WTR26 Lincoln')
  })

  it('handles empty registrations list', async () => {
    const services = mockServices({ registrations: [] })
    const result = await processConference(
      makeConferenceDetail(),
      '2026-01-01T00:00:00Z',
      services
    )

    expect(result.registrationsFound).toBe(0)
    expect(result.registrantsProcessed).toBe(0)
    expect(result.records).toHaveLength(0)
    expect(services.salesforce.insertStagingRecords).not.toHaveBeenCalled()
  })
})
