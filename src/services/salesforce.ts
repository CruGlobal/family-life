import { Connection } from 'jsforce'
import { getConfig } from '../config/index.js'
import type { StagingInvolvementRecord, InsertResult, CompositeResponse } from '../types/salesforce.js'
import { logger } from '../utils/logging.js'

// Composite API: up to 5 SObject Collections subrequests × 200 records = 1,000 max
const MAX_ATOMIC_RECORDS = 1_000

export class SalesforceService {
  private connection: Connection | null = null

  async getConnection(): Promise<Connection> {
    if (this.connection) return this.connection

    const config = getConfig()

    // OAuth 2.0 client_credentials flow
    const tokenResponse = await fetch(`${config.sfLoginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.sfClientId,
        client_secret: config.sfClientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => '')
      throw new Error(`SF auth failed (${tokenResponse.status}): ${body}`)
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string
      instance_url: string
    }

    this.connection = new Connection({
      instanceUrl: tokenData.instance_url,
      accessToken: tokenData.access_token,
      version: '62.0',
    })

    return this.connection
  }

  async insertStagingRecords(records: StagingInvolvementRecord[]): Promise<InsertResult> {
    if (records.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] }
    }

    if (records.length > MAX_ATOMIC_RECORDS) {
      throw new Error(
        `Cannot atomically insert ${records.length} records (max ${MAX_ATOMIC_RECORDS}). ` +
        'Split into smaller runs or increase the sync frequency.'
      )
    }

    const config = getConfig()
    const conn = await this.getConnection()
    const batchSize = config.sfBatchSize
    const version = conn.version

    // Build SObject Collections subrequests (up to 200 records each)
    const compositeRequest: Array<{
      url: string
      method: string
      referenceId: string
      body: { allOrNone: boolean; records: Array<Record<string, unknown>> }
    }> = []

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const batchIndex = Math.floor(i / batchSize)

      compositeRequest.push({
        url: `/services/data/v${version}/composite/sobjects`,
        method: 'POST',
        referenceId: `batch_${batchIndex}`,
        body: {
          allOrNone: true,
          records: batch.map(rec => ({
            attributes: { type: 'Staging_Involvement__c' },
            ...rec,
          })),
        },
      })
    }

    logger.debug('Sending Composite API request', {
      totalRecords: records.length,
      subrequests: compositeRequest.length,
    })

    const response = await conn.requestPost(
      `/services/data/v${version}/composite`,
      { allOrNone: true, compositeRequest }
    ) as CompositeResponse

    // Check for failures — with allOrNone the entire request is rolled back on any error
    const errors: string[] = []
    const result: InsertResult = { successCount: 0, errorCount: 0, errors: [] }

    for (const sub of response.compositeResponse) {
      for (const item of sub.body) {
        if (item.success) {
          result.successCount++
        } else {
          result.errorCount++
          for (const err of item.errors) {
            errors.push(err.message)
          }
        }
      }
    }

    if (result.errorCount > 0) {
      throw new Error(
        `Composite insert failed (all records rolled back): ${errors.join('; ')}`
      )
    }

    logger.info('Composite insert succeeded', {
      successCount: result.successCount,
      subrequests: compositeRequest.length,
    })

    return result
  }
}

export function createSalesforceService(): SalesforceService {
  return new SalesforceService()
}
