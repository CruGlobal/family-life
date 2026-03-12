import type { Services } from '../services/index.js'
import type { ERTConferenceDetail } from '../types/ert.js'
import type { InsertResult } from '../types/salesforce.js'
import type { ConferenceResult } from './conference-processor.js'
import { processConference } from './conference-processor.js'
import { logger } from '../utils/logging.js'
import { getConfig } from '../config/index.js'

export interface RegistrationsToSFResult {
  runStartTime: string
  lastImportDate: string
  conferencesFound: number
  conferencesProcessed: number
  totalRecords: number
  conferenceResults: ConferenceResult[]
  insertResult: InsertResult
}

export async function runRegistrationsToSF(services: Services): Promise<RegistrationsToSFResult> {
  const runStartTime = new Date().toISOString()
  const config = getConfig()

  // 1. Read lastImportDate from SSM
  const lastImportDate = await services.ssm.getLastImportDate()
  logger.info('Starting sync', { lastImportDate, runStartTime })

  // 2. Get pre-filtered WTR conference IDs from ERT
  const conferenceIds = await services.ert.getConferenceIds(
    config.ertMinistryId,
    config.ertActivityId
  )

  logger.info('Fetched WTR conference IDs', { count: conferenceIds.length })

  // 3. Fetch full details for each conference
  const detailResults = await Promise.allSettled(
    conferenceIds.map(id => services.ert.getConferenceDetail(id))
  )

  const details: ERTConferenceDetail[] = detailResults
    .filter((r): r is PromiseFulfilledResult<ERTConferenceDetail> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value)

  if (details.length < conferenceIds.length) {
    const failedCount = conferenceIds.length - details.length
    logger.warn('Some conference details failed to fetch', {
      requested: conferenceIds.length,
      fetched: details.length,
      failed: failedCount,
    })
  }

  // 4. Gather records from all conferences (parallel, but any failure aborts the run)
  const gatherResults = await Promise.allSettled(
    details.map(detail =>
      processConference(detail, lastImportDate, services)
    )
  )

  const conferenceResults: ConferenceResult[] = []
  const gatherErrors: Array<{ conferenceId: string; error: string }> = []

  gatherResults.forEach((result, index) => {
    const detail = details[index]
    if (result.status === 'fulfilled') {
      conferenceResults.push(result.value)
    } else {
      const errMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
      gatherErrors.push({ conferenceId: detail.id, error: errMsg })
      logger.error('Conference gather failed', result.reason, {
        conferenceId: detail.id,
        conferenceName: detail.name,
      })
    }
  })

  // If any conference gather failed, abort — don't insert, don't advance cursor
  if (gatherErrors.length > 0) {
    const summary = gatherErrors.map(e => `${e.conferenceId}: ${e.error}`).join('; ')
    throw new Error(`Gather failed for ${gatherErrors.length} conference(s): ${summary}`)
  }

  // 5. Collect all records and do one atomic insert
  const allRecords = conferenceResults.flatMap(r => r.records)

  logger.info('Inserting all records atomically', {
    totalRecords: allRecords.length,
    conferences: conferenceResults.length,
  })

  const insertResult = await services.salesforce.insertStagingRecords(allRecords)

  // 6. Update lastImportDate only after successful insert
  await services.ssm.updateLastImportDate(runStartTime)

  const syncResult: RegistrationsToSFResult = {
    runStartTime,
    lastImportDate,
    conferencesFound: details.length,
    conferencesProcessed: conferenceResults.length,
    totalRecords: allRecords.length,
    conferenceResults,
    insertResult,
  }

  logger.info('Sync complete', {
    conferencesFound: syncResult.conferencesFound,
    conferencesProcessed: syncResult.conferencesProcessed,
    totalRecords: syncResult.totalRecords,
    insertSuccess: insertResult.successCount,
  })

  return syncResult
}
