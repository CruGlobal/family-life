import type { ScheduledEvent } from 'aws-lambda'
import { runRegistrationsToSF } from '../core/orchestrator.js'
import { createServices } from '../services/index.js'
import { rollbar } from '../config/index.js'
import { logger } from '../utils/logging.js'

export async function handler(_event: ScheduledEvent): Promise<void> {
  logger.info('registrationsToSF handler invoked')

  try {
    const services = createServices()
    const result = await runRegistrationsToSF(services)

    logger.info('registrationsToSF handler complete', {
      conferencesProcessed: result.conferencesProcessed,
      totalRecords: result.totalRecords,
      insertSuccess: result.insertResult.successCount,
    })
  } catch (err) {
    logger.error('registrationsToSF handler failed', err)
    await rollbar.error('registrationsToSF handler failed', err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
