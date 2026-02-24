import type { Services } from '../services/index.js'
import type { ConferenceResult } from './conference-processor.js'
import { processConference } from './conference-processor.js'
import { logger } from '../utils/logging.js'
import { getConfig } from '../config/index.js'

export interface RegistrationsToSFResult {
  runStartTime: string
  lastImportDate: string
  conferencesFound: number
  conferencesProcessed: number
  conferenceResults: ConferenceResult[]
  errors: Array<{ conferenceId: string; error: string }>
}

export async function runRegistrationsToSF(services: Services): Promise<RegistrationsToSFResult> {
  const runStartTime = new Date().toISOString()
  const config = getConfig()

  // 1. Read lastImportDate from SSM
  const lastImportDate = await services.ssm.getLastImportDate()
  logger.info('Starting sync', { lastImportDate, runStartTime })

  // 2. Find FamilyLife ministry and WTR activity
  const ministries = await services.ert.getMinistries()

  const ministry = ministries.find(m => m.name === config.ertMinistryName)
  if (!ministry) {
    throw new Error(`Ministry "${config.ertMinistryName}" not found in ERT`)
  }

  if (!ministry.activities || ministry.activities.length === 0) {
    throw new Error(`Ministry "${config.ertMinistryName}" has no activities`)
  }

  const wtrActivity = ministry.activities.find(a => a.name === config.ertActivityName)
  if (!wtrActivity) {
    throw new Error(
      `Activity "${config.ertActivityName}" not found in ministry "${config.ertMinistryName}"`
    )
  }

  // Fetch conferences for this ministry (need eventType, but we don't filter by it on API call)
  const allConferences = await services.ert.getConferences(ministry.id, '')

  // Filter: only WTR conferences, not archived
  const wtrConferences = allConferences.filter(c =>
    c.ministryActivity === wtrActivity.id && !c.archived
  )

  logger.info('Found WTR conferences', {
    total: allConferences.length,
    wtr: wtrConferences.length,
  })

  // 4. Process each conference (Promise.allSettled for isolation)
  const results = await Promise.allSettled(
    wtrConferences.map(conf =>
      processConference(conf, lastImportDate, services)
    )
  )

  const conferenceResults: ConferenceResult[] = []
  const errors: Array<{ conferenceId: string; error: string }> = []

  results.forEach((result, index) => {
    const conf = wtrConferences[index]
    if (result.status === 'fulfilled') {
      conferenceResults.push(result.value)
    } else {
      const errMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
      errors.push({ conferenceId: conf.id, error: errMsg })
      logger.error('Conference processing failed', result.reason, {
        conferenceId: conf.id,
        conferenceName: conf.name,
      })
    }
  })

  // 5. Update lastImportDate
  await services.ssm.updateLastImportDate(runStartTime)

  const syncResult: RegistrationsToSFResult = {
    runStartTime,
    lastImportDate,
    conferencesFound: wtrConferences.length,
    conferencesProcessed: conferenceResults.length,
    conferenceResults,
    errors,
  }

  logger.info('Sync complete', {
    conferencesFound: syncResult.conferencesFound,
    conferencesProcessed: syncResult.conferencesProcessed,
    errors: syncResult.errors.length,
  })

  return syncResult
}
