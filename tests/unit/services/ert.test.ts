import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErtService } from '@/services/ert.js'
import { resetConfig } from '@/config/index.js'
import { logger } from '@/utils/logging.js'

describe('ErtService', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetConfig()
    process.env.ERT_BASE_URL = 'https://api.test.com/rest'
    process.env.ERT_API_KEY = 'test-api-key'
    process.env.SF_LOGIN_URL = 'https://test.sf.com'
    process.env.SF_CLIENT_ID = 'sf-id'
    process.env.SF_CLIENT_SECRET = 'sf-secret'
    process.env.SSM_LAST_IMPORT_DATE_PARAM = '/test/param'
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetConfig()
  })

  it('getConferenceDetail fetches by conferenceId', async () => {
    const detail = { id: 'c-1', name: 'Test', registrationPages: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    })

    const svc = new ErtService()
    const result = await svc.getConferenceDetail('c-1')

    expect(result).toEqual(detail)
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calledUrl).toContain('/conferences/c-1')
  })

  it('getRegistrations passes pagination and filter params', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ registrations: [], meta: { totalPages: 1, currentPage: 0 } }),
    })

    const svc = new ErtService()
    await svc.getRegistrations('c-1', {
      page: 0,
      pageSize: 50,
      filterAfter: '2026-01-01T00:00:00Z',
    })

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calledUrl).toContain('page=0')
    expect(calledUrl).toContain('per_page=50')
    expect(calledUrl).toContain('filterAfter=')
  })

  // Serve a fixed list of pages, then empty pages forever (how ERT behaves).
  function mockPages(pages: Array<Array<{ id: string; registrants?: Array<{ id: string }> }>>, meta = {}) {
    let call = 0
    global.fetch = vi.fn().mockImplementation(() => {
      const registrations = pages[call] ?? []
      call++
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          registrations,
          meta: { totalPages: 2, currentPage: 0, ...meta },
        }),
      })
    })
    return () => call
  }

  it('getAllRegistrations paginates through all pages', async () => {
    mockPages([[{ id: 'r1' }], [{ id: 'r2' }]])

    const svc = new ErtService()
    const result = await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z', 1)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('r1')
    expect(result[1].id).toBe('r2')
  })

  // ERT under-reports totalPages: it repeats a page, which pushes the real tail
  // past the reported count. Trusting totalPages silently drops those records.
  it('keeps paging past totalPages until a page comes back empty', async () => {
    mockPages(
      [
        [{ id: 'ra', registrants: [{ id: 'g1' }] }],
        [{ id: 'ra', registrants: [{ id: 'g1' }] }], // repeat of page 0
        [{ id: 'rb', registrants: [{ id: 'g2' }] }],
        [{ id: 'rc', registrants: [{ id: 'g3' }] }], // beyond totalPages: 2
      ],
      { totalPages: 2, totalRegistrantsFilter: 3 }
    )

    const svc = new ErtService()
    const result = await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z')

    expect(result.flatMap(r => r.registrants!.map(g => g.id))).toEqual(['g1', 'g2', 'g3'])
  })

  it('deduplicates registrants repeated across pages', async () => {
    mockPages(
      [
        [{ id: 'ra', registrants: [{ id: 'g1' }, { id: 'g2' }] }],
        [{ id: 'ra', registrants: [{ id: 'g1' }, { id: 'g2' }] }],
        [{ id: 'ra', registrants: [{ id: 'g2' }, { id: 'g3' }] }], // partial overlap
      ],
      { totalRegistrantsFilter: 3 }
    )

    const svc = new ErtService()
    const result = await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z')

    const registrantIds = result.flatMap(r => r.registrants!.map(g => g.id))
    expect(registrantIds).toEqual(['g1', 'g2', 'g3'])
    expect(new Set(registrantIds).size).toBe(registrantIds.length)
  })

  it('stops at an empty page without consuming the page cap', async () => {
    const calls = mockPages([[{ id: 'r1', registrants: [{ id: 'g1' }] }]])

    const svc = new ErtService()
    await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z')

    expect(calls()).toBe(2) // one page of data, one empty page to terminate
  })

  // ERT's totals over-report, so a mismatch is normal and must not raise an
  // alarm on every run — it is recorded at info as a change signal only.
  it('records a count mismatch at info, not as a warning', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    mockPages(
      [[{ id: 'ra', registrants: [{ id: 'g1' }] }]],
      { totalRegistrantsFilter: 5 }
    )

    const svc = new ErtService()
    await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z')

    expect(info).toHaveBeenCalledWith(
      'ERT reported registrant count differs from fetched',
      expect.objectContaining({
        distinctRegistrants: 1,
        totalRegistrantsFilter: 5,
        difference: 4,
      })
    )
    expect(warn).not.toHaveBeenCalled()
    info.mockRestore()
    warn.mockRestore()
  })

  it('getConferenceIds calls integrations endpoint with ministry and activity params', async () => {
    const mockIds = ['conf-1', 'conf-2', 'conf-3']
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockIds),
    })

    const svc = new ErtService()
    const result = await svc.getConferenceIds('m-1', 'a-1')

    expect(result).toEqual(mockIds)
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calledUrl).toContain('/integrations/conferences')
    expect(calledUrl).toContain('ministries=m-1')
    expect(calledUrl).toContain('ministryActivities=a-1')
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    const svc = new ErtService()
    await expect(svc.getConferenceIds('m-1', 'a-1')).rejects.toThrow('ERT API error 500')
  })
})
