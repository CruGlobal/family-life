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

  // 2. Find FamilyLife ministry and WTR activity
  const ministries = await services.ert.getMinistries()

  const ministry = ministries.find(m => m.id === config.ertMinistryId)
  if (!ministry) {
    throw new Error(`Ministry "${config.ertMinistryId}" not found in ERT`)
  }

  if (!ministry.activities || ministry.activities.length === 0) {
    throw new Error(`Ministry "${config.ertMinistryId}" has no activities`)
  }

  const wtrActivity = ministry.activities.find(a => a.id === config.ertActivityId)
  if (!wtrActivity) {
    throw new Error(
      `Activity "${config.ertActivityId}" not found in ministry "${config.ertMinistryId}"`
    )
  }

  // Fetch conferences for this ministry, filtered by WTR event type.
  // The eventTypes param is required in production to avoid returning all 10K+ conferences.
  const WTR_EVENT_TYPE_ID = '9f63db46-6ca9-43b0-868a-23326b3c4d91'
  const allConferences = await services.ert.getConferences(ministry.id, WTR_EVENT_TYPE_ID)

  // The list endpoint doesn't reliably return ministryActivity, so we
  // fetch the detail for each non-archived conference to get the real value.
  const nonArchived = allConferences.filter(c => !c.archived)

  logger.info('Fetching conference details to determine activity', {
    total: allConferences.length,
    nonArchived: nonArchived.length,
  })

  const detailResults = await Promise.allSettled(
    nonArchived.map(c => services.ert.getConferenceDetail(c.id))
  )

  const wtrDetails: ERTConferenceDetail[] = []
  for (const result of detailResults) {
    if (result.status === 'fulfilled' && result.value.ministryActivity === wtrActivity.id) {
      wtrDetails.push(result.value)
    }
  }

  logger.info('Found WTR conferences', {
    nonArchived: nonArchived.length,
    wtr: wtrDetails.length,
  })

  // 3. Gather records from all conferences (parallel, but any failure aborts the run)
  const gatherResults = await Promise.allSettled(
    wtrDetails.map(detail =>
      processConference(detail, lastImportDate, services)
    )
  )

  const conferenceResults: ConferenceResult[] = []
  const gatherErrors: Array<{ conferenceId: string; error: string }> = []

  gatherResults.forEach((result, index) => {
    const detail = wtrDetails[index]
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

  // 4. Collect all records and do one atomic insert
  const allRecords = conferenceResults.flatMap(r => r.records)

  logger.info('Inserting all records atomically', {
    totalRecords: allRecords.length,
    conferences: conferenceResults.length,
  })

  const insertResult = await services.salesforce.insertStagingRecords(allRecords)

  // 5. Update lastImportDate only after successful insert
  await services.ssm.updateLastImportDate(runStartTime)

  const syncResult: RegistrationsToSFResult = {
    runStartTime,
    lastImportDate,
    conferencesFound: wtrDetails.length,
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
