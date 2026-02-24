import type { ERTConferenceDetail, ERTConferenceSummary } from '../types/ert.js'
import type { StagingInvolvementRecord, InsertResult } from '../types/salesforce.js'
import type { Services } from '../services/index.js'
import type { BlockLookups } from './answer-processor.js'
import { transformRegistrant, type TransformContext } from './registration-transformer.js'
import { logger } from '../utils/logging.js'

export interface ConferenceResult {
  conferenceId: string
  conferenceName: string
  registrationsFound: number
  registrantsProcessed: number
  registrantsSkipped: number
  insertResult: InsertResult
}

export async function processConference(
  conferenceSummary: ERTConferenceSummary,
  lastImportDate: string,
  services: Services
): Promise<ConferenceResult> {
  const conferenceId = conferenceSummary.id

  // Fetch full conference detail (blocks, registrant types)
  const detail: ERTConferenceDetail = await services.ert.getConferenceDetail(conferenceId)

  // Build lookup maps
  const lookups = buildLookups(detail)
  const regTypeNameLookup = buildRegTypeNameLookup(detail)

  // Fetch registrations (paginated, filtered by lastImportDate)
  const registrations = await services.ert.getAllRegistrations(
    conferenceId,
    lastImportDate,
    services.ert instanceof Object ? undefined : undefined // use default page size
  )

  logger.info('Fetched registrations for conference', {
    conferenceId,
    conferenceName: detail.name,
    count: registrations.length,
  })

  // Transform registrants
  const context: TransformContext = {
    conference: detail,
    lookups,
    regTypeNameLookup,
  }

  const sfRecords: StagingInvolvementRecord[] = []
  let skipped = 0

  for (const registration of registrations) {
    for (const registrant of registration.registrants || []) {
      const record = transformRegistrant(registration, registrant, context)
      if (record) {
        sfRecords.push(record)
      } else {
        skipped++
      }
    }
  }

  // Insert into Salesforce
  const insertResult = await services.salesforce.insertStagingRecords(sfRecords)

  logger.info('Conference processing complete', {
    conferenceId,
    conferenceName: detail.name,
    registrationsFound: registrations.length,
    registrantsProcessed: sfRecords.length,
    registrantsSkipped: skipped,
    sfSuccess: insertResult.successCount,
    sfErrors: insertResult.errorCount,
  })

  return {
    conferenceId,
    conferenceName: detail.name,
    registrationsFound: registrations.length,
    registrantsProcessed: sfRecords.length,
    registrantsSkipped: skipped,
    insertResult,
  }
}

function buildLookups(detail: ERTConferenceDetail): BlockLookups {
  const titleLookup: Record<string, string> = {}
  const profileTypeLookup: Record<string, string | null> = {}
  const tagNameLookup: Record<string, string> = {}

  for (const page of detail.registrationPages || []) {
    for (const block of page.blocks || []) {
      titleLookup[block.id] = block.title
      profileTypeLookup[block.id] = block.profileType
      if (block.blockTagType?.name) {
        tagNameLookup[block.id] = block.blockTagType.name
      }
    }
  }

  return { titleLookup, profileTypeLookup, tagNameLookup }
}

function buildRegTypeNameLookup(detail: ERTConferenceDetail): Record<string, string> {
  const lookup: Record<string, string> = {}
  for (const rt of detail.registrantTypes || []) {
    lookup[rt.id] = rt.name
  }
  return lookup
}
