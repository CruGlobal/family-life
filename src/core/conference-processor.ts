import type { ERTConferenceDetail } from '../types/ert.js'
import type { StagingInvolvementRecord } from '../types/salesforce.js'
import type { Services } from '../services/index.js'
import type { BlockLookups } from './answer-processor.js'
import { transformRegistrant, type TransformContext } from './registration-transformer.js'
import { hasEventEnded } from './field-mapping.js'
import { logger } from '../utils/logging.js'

export interface ConferenceResult {
  conferenceId: string
  conferenceName: string
  registrationsFound: number
  registrantsProcessed: number
  registrantsSkipped: number
  registrantsSuppressedPostEvent: number
  records: StagingInvolvementRecord[]
}

export interface ProcessConferenceOptions {
  /**
   * After the event end date, drop every record whose status is not Canceled.
   * Post-event, Salesforce only needs withdrawals — anything else (waiver and
   * DocuSign bumps, contact edits, late check-ins) re-sends a stale status
   * that clobbers what FamilyLife set after the event closed.
   *
   * On for the scheduled sync. Off for reconciliation, which must still see
   * records lost while the event was live — an inherited filter would hide
   * exactly the losses it exists to find.
   */
  suppressPostEvent?: boolean
}

export async function processConference(
  detail: ERTConferenceDetail,
  lastImportDate: string,
  services: Services,
  options: ProcessConferenceOptions = {}
): Promise<ConferenceResult> {
  const conferenceId = detail.id

  // One check per conference: every registrant shares the event end, and this
  // keeps the missing-timezone warning inside hasEventEnded to one line per
  // conference instead of one per registrant.
  const suppressing =
    options.suppressPostEvent === true &&
    hasEventEnded(detail.eventEndTime, detail.eventTimezone)

  // Build lookup maps
  const lookups = buildLookups(detail)
  const regTypeNameLookup = buildRegTypeNameLookup(detail)

  // Fetch registrations (paginated, filtered by lastImportDate). Page size is
  // left to the service: ERT ignores `per_page` and always returns 20 per page.
  const registrations = await services.ert.getAllRegistrations(
    conferenceId,
    lastImportDate
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
  let suppressed = 0

  for (const registration of registrations) {
    for (const registrant of registration.registrants || []) {
      const record = transformRegistrant(registration, registrant, context)
      if (!record) {
        skipped++
        continue
      }
      // Per-registrant, deliberately: a post-event withdrawal on one spouse
      // re-sends the whole registration — the Canceled spouse goes through,
      // the other's stale Registered must not.
      if (suppressing && record.Involvement_Status__c !== 'Canceled') {
        suppressed++
        logger.info('Suppressed post-event record', {
          conferenceId,
          conferenceName: detail.name,
          registrantId: registrant.id,
          involvementStatus: record.Involvement_Status__c,
        })
        continue
      }
      sfRecords.push(record)
    }
  }

  logger.info('Conference gather complete', {
    conferenceId,
    conferenceName: detail.name,
    registrationsFound: registrations.length,
    registrantsProcessed: sfRecords.length,
    registrantsSkipped: skipped,
    registrantsSuppressedPostEvent: suppressed,
  })

  return {
    conferenceId,
    conferenceName: detail.name,
    registrationsFound: registrations.length,
    registrantsProcessed: sfRecords.length,
    registrantsSkipped: skipped,
    registrantsSuppressedPostEvent: suppressed,
    records: sfRecords,
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
