/**
 * Reconcile ERT against the Salesforce staging object.
 *
 * Every run before the pagination fix trusted ERT's `meta.totalPages`, which
 * under-reports — so the tail of each conference's page set was never fetched
 * and those registrants were never delivered. This rebuilds the authoritative
 * set from ERT, compares it against what staging actually received, and reports
 * (or sends) the difference.
 *
 * Dry run by default. Nothing is written to Salesforce without --apply.
 *
 * Post-event rule: on conferences whose event has ended, only Canceled records
 * are ever inserted — other missing records there are listed as "held" for
 * manual review, matching the scheduled sync's suppression rule.
 *
 *   npx tsx scripts/reconcile.ts [--since <ISO-8601>] [--apply]
 *
 * Requires an assumed AWS role for ERT/SF credentials.
 */
import { createErtService } from '../src/services/ert.js'
import { createSalesforceService } from '../src/services/salesforce.js'
import { processConference } from '../src/core/conference-processor.js'
import { hasEventEnded } from '../src/core/field-mapping.js'
import { getConfig } from '../src/config/index.js'
import type { ERTConferenceDetail } from '../src/types/ert.js'
import type { StagingInvolvementRecord } from '../src/types/salesforce.js'
import type { Services } from '../src/services/index.js'

/** First production deploy of this Lambda — nothing it sent predates this. */
const GO_LIVE = '2026-03-06T18:33:21Z'

/** Composite API ceiling enforced by insertStagingRecords. */
const MAX_PER_INSERT = 1_000

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const sinceIdx = args.indexOf('--since')
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : GO_LIVE

/** Identity of a staging record: one registrant on one registration. */
function key(involvementExternalId: string, contactExternalId: string): string {
  return `${involvementExternalId}|${contactExternalId}`
}

/** Every (involvement, contact) pair this sync has already delivered. */
async function fetchDeliveredKeys(salesforce: ReturnType<typeof createSalesforceService>) {
  const conn = await salesforce.getConnection()
  const delivered = new Set<string>()

  const result = await conn.query<{
    Involvement_External_Id__c: string
    Contact_External_Id__c: string
  }>(
    `SELECT Involvement_External_Id__c, Contact_External_Id__c
     FROM Staging_Involvement__c
     WHERE Source__c = 'ERT'`,
    { autoFetch: true, maxFetch: 500_000 }
  )

  for (const r of result.records) {
    if (r.Involvement_External_Id__c && r.Contact_External_Id__c) {
      delivered.add(key(r.Involvement_External_Id__c, r.Contact_External_Id__c))
    }
  }

  return delivered
}

/**
 * Rebuild what ERT says should exist, using the same gather and skip rules the
 * scheduled sync uses so the two sides are directly comparable.
 */
interface ExpectedRecords {
  records: StagingInvolvementRecord[]
  /** Event_Id__c (abbreviation) of every conference whose event has ended. */
  endedEvents: Set<string>
}

async function buildExpectedRecords(services: Services): Promise<ExpectedRecords> {
  const config = getConfig()

  const conferenceIds = await services.ert.getConferenceIds(
    config.ertMinistryId,
    config.ertActivityId
  )
  console.error(`conferences returned: ${conferenceIds.length}`)

  const detailResults = await Promise.allSettled(
    conferenceIds.map(id => services.ert.getConferenceDetail(id))
  )
  const details = detailResults
    .filter((r): r is PromiseFulfilledResult<ERTConferenceDetail> => r.status === 'fulfilled')
    .map(r => r.value)

  const failedDetails = conferenceIds.length - details.length
  if (failedDetails > 0) {
    console.error(`WARNING: ${failedDetails} conference detail fetch(es) failed — results incomplete`)
  }

  const wtrDetails = details.filter(d => d.abbreviation?.startsWith('WTR'))
  console.error(`WTR conferences: ${wtrDetails.length}`)

  const records: StagingInvolvementRecord[] = []
  const endedEvents = new Set<string>()
  let failures = 0

  // Sequential: this walks every page of every conference and there is no
  // deadline here, unlike the scheduled run.
  for (const detail of wtrDetails) {
    // suppressPostEvent stays OFF here — the scheduled sync's post-event filter
    // would hide records lost while the event was live, which is exactly what
    // reconciliation exists to find. Ended events are tracked instead so the
    // apply step can hold their non-canceled records for review.
    if (hasEventEnded(detail.eventEndTime, detail.eventTimezone) && detail.abbreviation) {
      endedEvents.add(detail.abbreviation)
    }
    try {
      const result = await processConference(detail, since, services, { suppressPostEvent: false })
      records.push(...result.records)
    } catch (err) {
      failures++
      console.error(`  gather failed for ${detail.name} (${detail.id}): ${String(err)}`)
    }
  }

  if (failures > 0) {
    console.error(`WARNING: ${failures} conference(s) failed to gather — the gap below is a LOWER BOUND`)
  }

  return { records, endedEvents }
}

async function main() {
  // processConference only reads services.ert, but the Services type wants a
  // real SsmService. Stub it so the cursor can never be touched from here.
  const ssmStub = {
    getLastImportDate: async () => since,
    updateLastImportDate: async () => {
      throw new Error('reconcile must never advance the cursor')
    },
  } as unknown as Services['ssm']

  const services: Services = {
    ert: createErtService(),
    salesforce: createSalesforceService(),
    ssm: ssmStub,
  }

  console.error(`since:  ${since}`)
  console.error(`mode:   ${apply ? 'APPLY (will insert)' : 'dry run (read-only)'}\n`)

  const { records: expected, endedEvents } = await buildExpectedRecords(services)
  const delivered = await fetchDeliveredKeys(services.salesforce)

  // Dedupe the expected side too — a couple shares an involvement id, so the
  // pair is the identity, not the involvement alone.
  const expectedByKey = new Map<string, StagingInvolvementRecord>()
  for (const rec of expected) {
    expectedByKey.set(key(rec.Involvement_External_Id__c, rec.Contact_External_Id__c), rec)
  }

  const allMissing = [...expectedByKey.entries()]
    .filter(([k]) => !delivered.has(k))
    .map(([, rec]) => rec)

  // Mirror the scheduled sync's post-event rule at the apply boundary: on an
  // ended event, only Canceled may be inserted. Anything else missing there is
  // reported for manual review — inserting it now would land a stale status on
  // an event FamilyLife has already closed out.
  const heldPostEvent = allMissing.filter(
    rec => endedEvents.has(rec.Event_Id__c || '') && rec.Involvement_Status__c !== 'Canceled'
  )
  const missing = allMissing.filter(rec => !heldPostEvent.includes(rec))

  console.error('')
  console.error(`expected records from ERT (deduped): ${expectedByKey.size}`)
  console.error(`  raw before dedupe:                 ${expected.length}`)
  console.error(`already delivered to staging:        ${delivered.size}`)
  console.error(`MISSING (never delivered):           ${allMissing.length}`)
  console.error(`  insertable:                        ${missing.length}`)
  console.error(`  held (post-event, non-canceled):   ${heldPostEvent.length}`)

  if (heldPostEvent.length > 0) {
    console.error('\nheld for manual review (event ended; status is not Canceled):')
    for (const rec of heldPostEvent) {
      const name = `${rec.First_Name__c ?? ''} ${rec.Last_Name__c}`.trim()
      console.error(
        `  ${(rec.Event_Id__c || '?').padEnd(11)} ${name.padEnd(24)}` +
        ` status=${rec.Involvement_Status__c}`
      )
      console.error(`      ${rec.Involvement_External_Id__c} | ${rec.Contact_External_Id__c}`)
    }
  }

  const byConference = new Map<string, number>()
  for (const rec of missing) {
    const id = rec.Event_Id__c || '(unknown)'
    byConference.set(id, (byConference.get(id) ?? 0) + 1)
  }
  if (byConference.size > 0) {
    console.error('\nmissing by event:')
    for (const [event, n] of [...byConference.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.error(`  ${event.padEnd(20)} ${n}`)
    }
    if (byConference.size > 20) console.error(`  ... and ${byConference.size - 20} more events`)

    // Itemise so an --apply can be checked against a known list before writing.
    // Registrations created very recently are usually in-flight rather than
    // lost: the next scheduled run will collect them.
    console.error('\nmissing records:')
    for (const rec of missing) {
      const name = `${rec.First_Name__c ?? ''} ${rec.Last_Name__c}`.trim()
      console.error(
        `  ${(rec.Event_Id__c || '?').padEnd(11)} ${name.padEnd(24)}` +
        ` created=${rec.Involvement_Registration_Created_Date__c ?? 'n/a'}`
      )
      console.error(`      ${rec.Involvement_External_Id__c} | ${rec.Contact_External_Id__c}`)
    }
  }

  if (!apply) {
    console.error('\ndry run — nothing inserted. Re-run with --apply to send the missing records.')
    console.log(JSON.stringify({
      expected: expectedByKey.size,
      delivered: delivered.size,
      missing: missing.length,
      heldPostEvent: heldPostEvent.length,
    }, null, 2))
    return
  }

  if (missing.length === 0) {
    console.error('\nnothing to insert.')
    return
  }

  console.error(`\ninserting ${missing.length} record(s) in batches of ${MAX_PER_INSERT}...`)
  let inserted = 0
  for (let i = 0; i < missing.length; i += MAX_PER_INSERT) {
    const batch = missing.slice(i, i + MAX_PER_INSERT)
    const result = await services.salesforce.insertStagingRecords(batch)
    inserted += result.successCount
    console.error(`  batch ${Math.floor(i / MAX_PER_INSERT) + 1}: ${result.successCount} inserted`)
  }
  console.error(`\ndone. inserted ${inserted} of ${missing.length}.`)
}

main().catch(err => { console.error(err); process.exit(1) })

