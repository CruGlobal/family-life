import type { ScheduledEvent } from 'aws-lambda'
import { runSync } from '../core/orchestrator.js'
import { createServices } from '../services/index.js'
import { rollbar } from '../config/index.js'
import { logger } from '../utils/logging.js'

export async function handler(_event: ScheduledEvent): Promise<void> {
  logger.info('ERT sync handler invoked')

  try {
    const services = createServices()
    const result = await runSync(services)

    logger.info('ERT sync handler complete', {
      conferencesProcessed: result.conferencesProcessed,
      errors: result.errors.length,
    })

    if (result.errors.length > 0) {
      await rollbar.warning('ERT sync completed with errors', {
        errors: result.errors,
        conferencesProcessed: result.conferencesProcessed,
      })
    }
  } catch (err) {
    logger.error('ERT sync handler failed', err)
    await rollbar.error('ERT sync handler failed', err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
