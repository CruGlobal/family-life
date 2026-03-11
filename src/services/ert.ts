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

  async getAllRegistrations(
    conferenceId: string,
    filterAfter?: string,
    pageSize = 100
  ): Promise<ERTRegistration[]> {
    const allRegistrations: ERTRegistration[] = []
    let currentPage = 0
    let totalPages = 1

    while (currentPage < totalPages) {
      const response = await this.getRegistrations(conferenceId, {
        page: currentPage,
        pageSize,
        filterAfter,
      })

      allRegistrations.push(...response.registrations)
      totalPages = response.meta.totalPages
      currentPage++

      logger.debug('Fetched registration page', {
        conferenceId,
        page: currentPage,
        totalPages,
        count: response.registrations.length,
      })
    }

    return allRegistrations
  }
}

export function createErtService(): ErtService {
  return new ErtService()
}
