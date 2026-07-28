import { getConfig } from '../config/index.js'
import type {
  ERTConferenceDetail,
  ERTRegistration,
  ERTPaginatedResponse,
} from '../types/ert.js'
import { logger } from '../utils/logging.js'

/** Convert an ISO 8601 datetime to the format ERT expects: `DD/MM/YYYY HH:mm:ss` */
function toErtDatetime(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  const seconds = String(d.getUTCSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

/**
 * Safety cap on pagination. ERT serves 20 rows per page regardless of
 * `per_page`, so this allows 10,000 registrants for a single conference — far
 * above any real event, while still bounding a malformed response.
 */
const MAX_REGISTRATION_PAGES = 500

export class ErtService {
  private baseUrl: string
  private apiKey: string

  constructor() {
    const config = getConfig()
    this.baseUrl = config.ertBaseUrl.replace(/\/$/, '')
    this.apiKey = config.ertApiKey
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': this.apiKey,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`ERT API error ${response.status} for ${path}: ${body}`)
    }

    return response.json() as Promise<T>
  }

  async getConferenceIds(ministryId: string, activityId: string): Promise<string[]> {
    return this.request<string[]>('/integrations/conferences', {
      ministries: ministryId,
      ministryActivities: activityId,
    })
  }

  async getConferenceDetail(conferenceId: string): Promise<ERTConferenceDetail> {
    return this.request<ERTConferenceDetail>(`/conferences/${conferenceId}`)
  }

  async getRegistrations(
    conferenceId: string,
    options?: { page?: number; pageSize?: number; filterAfter?: string }
  ): Promise<ERTPaginatedResponse<ERTRegistration>> {
    const params: Record<string, string> = {}
    if (options?.page !== undefined) params.page = String(options.page)
    if (options?.pageSize !== undefined) params.per_page = String(options.pageSize)
    if (options?.filterAfter) params.filterAfter = toErtDatetime(options.filterAfter)
    return this.request<ERTPaginatedResponse<ERTRegistration>>(
      `/conferences/${conferenceId}/registrations`,
      params
    )
  }

  /**
   * Fetch every registration for a conference, working around two ERT defects.
   *
   * 1. `per_page` is ignored — ERT always returns 20 rows per page.
   * 2. A page can repeat its predecessor, which both duplicates rows and pushes
   *    the real tail beyond the reported `meta.totalPages`. Trusting that count
   *    silently drops the trailing records.
   *
   * So we page until ERT returns an empty page rather than to `totalPages`, and
   * deduplicate by registrant id as we go. Termination is on an empty page, not
   * on "no new records" — a repeated page yields nothing new while later pages
   * still hold real data.
   */
  async getAllRegistrations(
    conferenceId: string,
    filterAfter?: string,
    pageSize = 100
  ): Promise<ERTRegistration[]> {
    const collected: ERTRegistration[] = []
    const seenRegistrants = new Set<string>()
    const seenRegistrations = new Set<string>()
    let totalRegistrantsFilter: number | undefined
    let page = 0
    let duplicateRows = 0

    for (; page < MAX_REGISTRATION_PAGES; page++) {
      const response = await this.getRegistrations(conferenceId, {
        page,
        pageSize,
        filterAfter,
      })

      if (response.registrations.length === 0) break

      if (response.meta?.totalRegistrantsFilter !== undefined) {
        totalRegistrantsFilter = response.meta.totalRegistrantsFilter
      }

      for (const registration of response.registrations) {
        const registrants = registration.registrants || []

        // Defensive: a registration with no registrants can only be deduped by
        // its own id.
        if (registrants.length === 0) {
          if (seenRegistrations.has(registration.id)) {
            duplicateRows++
            continue
          }
          seenRegistrations.add(registration.id)
          collected.push(registration)
          continue
        }

        const fresh = registrants.filter(r => !seenRegistrants.has(r.id))
        if (fresh.length === 0) {
          duplicateRows++
          continue
        }
        for (const r of fresh) seenRegistrants.add(r.id)

        collected.push(
          fresh.length === registrants.length
            ? registration
            : { ...registration, registrants: fresh }
        )
      }

      logger.debug('Fetched registration page', {
        conferenceId,
        page,
        count: response.registrations.length,
        distinctSoFar: seenRegistrants.size,
      })
    }

    if (page >= MAX_REGISTRATION_PAGES) {
      logger.warn('Hit registration page cap; results may be incomplete', {
        conferenceId,
        maxPages: MAX_REGISTRATION_PAGES,
      })
    }

    if (duplicateRows > 0) {
      logger.info('Discarded duplicate registration rows from ERT', {
        conferenceId,
        duplicateRows,
        distinctRegistrants: seenRegistrants.size,
      })
    }

    // The count ERT reports is the only cross-check available that we fetched
    // everything. A mismatch means records are still being missed.
    if (
      totalRegistrantsFilter !== undefined &&
      seenRegistrants.size !== totalRegistrantsFilter
    ) {
      logger.warn('Registrant count does not match ERT total', {
        conferenceId,
        distinctRegistrants: seenRegistrants.size,
        totalRegistrantsFilter,
      })
    }

    return collected
  }
}

export function createErtService(): ErtService {
  return new ErtService()
}
