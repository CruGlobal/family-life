import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm'
import { getConfig } from '../config/index.js'
import { logger } from '../utils/logging.js'

export class SsmService {
  private client: SSMClient

  constructor() {
    this.client = new SSMClient({})
  }

  async getLastImportDate(): Promise<string> {
    const config = getConfig()

    try {
      const result = await this.client.send(
        new GetParameterCommand({
          Name: config.ssmLastImportDateParam,
        })
      )
      const value = result.Parameter?.Value
      if (value) return value
    } catch (err) {
      logger.warn('Failed to read lastImportDate from SSM, defaulting to 24h ago', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Default: 24 hours ago
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }

  async updateLastImportDate(date: string): Promise<void> {
    const config = getConfig()

    await this.client.send(
      new PutParameterCommand({
        Name: config.ssmLastImportDateParam,
        Value: date,
        Type: 'String',
        Overwrite: true,
      })
    )

    logger.info('Updated lastImportDate in SSM', { value: date })
  }
}

export function createSsmService(): SsmService {
  return new SsmService()
}
