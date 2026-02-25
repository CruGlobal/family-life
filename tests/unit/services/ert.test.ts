import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErtService } from '@/services/ert.js'
import { resetConfig } from '@/config/index.js'

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

  it('getMinistries calls correct endpoint with auth header', async () => {
    const mockData = [{ id: '1', name: 'FamilyLife', activities: [] }]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const svc = new ErtService()
    const result = await svc.getMinistries()

    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com/rest/ministries',
      expect.objectContaining({
        headers: {
          Authorization: 'test-api-key',
          Accept: 'application/json',
        },
      })
    )
  })

  it('getConferences passes ministry and eventType params', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const svc = new ErtService()
    await svc.getConferences('m-1', 'et-1')

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calledUrl).toContain('/conferences')
    expect(calledUrl).toContain('ministries=m-1')
    expect(calledUrl).toContain('eventTypes=et-1')
  })

  it('getConferences omits eventTypes when not provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const svc = new ErtService()
    await svc.getConferences('m-1')

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calledUrl).toContain('ministries=m-1')
    expect(calledUrl).not.toContain('eventTypes')
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

  it('getAllRegistrations paginates through all pages', async () => {
    const page0 = {
      registrations: [{ id: 'r1' }],
      meta: { totalPages: 2, currentPage: 0 },
    }
    const page1 = {
      registrations: [{ id: 'r2' }],
      meta: { totalPages: 2, currentPage: 1 },
    }

    let callCount = 0
    global.fetch = vi.fn().mockImplementation(() => {
      const data = callCount === 0 ? page0 : page1
      callCount++
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(data),
      })
    })

    const svc = new ErtService()
    const result = await svc.getAllRegistrations('c-1', '2026-01-01T00:00:00Z', 1)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('r1')
    expect(result[1].id).toBe('r2')
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    const svc = new ErtService()
    await expect(svc.getMinistries()).rejects.toThrow('ERT API error 500')
  })
})
