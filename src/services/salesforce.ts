import { Connection } from 'jsforce'
import { getConfig } from '../config/index.js'
import type { StagingInvolvementRecord, InsertResult } from '../types/salesforce.js'
import { logger } from '../utils/logging.js'

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
    })

    return this.connection
  }

  async insertStagingRecords(records: StagingInvolvementRecord[]): Promise<InsertResult> {
    if (records.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] }
    }

    const config = getConfig()
    const conn = await this.getConnection()
    const batchSize = config.sfBatchSize
    const result: InsertResult = { successCount: 0, errorCount: 0, errors: [] }

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      const insertResults = await conn
        .sobject('Staging_Involvement_Object__c')
        .insert(batch as unknown as Record<string, unknown>[])

      const resultsArray = Array.isArray(insertResults) ? insertResults : [insertResults]

      for (const r of resultsArray) {
        if (r.success) {
          result.successCount++
        } else {
          result.errorCount++
          const errors = (r as { errors?: Array<{ message: string }> }).errors || []
          for (const err of errors) {
            result.errors.push({
              id: (r as { id?: string }).id,
              message: err.message,
            })
          }
        }
      }

      logger.debug('Inserted SF batch', {
        batchIndex: Math.floor(i / batchSize),
        batchSize: batch.length,
        successCount: result.successCount,
        errorCount: result.errorCount,
      })
    }

    return result
  }
}

export function createSalesforceService(): SalesforceService {
  return new SalesforceService()
}
