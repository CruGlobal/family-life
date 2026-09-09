import { logger } from '../utils/logging.js'

// Simple 1:1 tag mappings: ERT blockTagType name → SF field name
export const TAG_TO_SF_FIELD: Record<string, string> = {
  'fl_registration_type': 'Involvement_Registration_Type__c',
  'fl_group_name': 'Group_Name__c',
  'fl_military_branch': 'Branch_of_Service__c',
  'fl_military_location': 'Military_Location__c',
  'fl_church_affiliation': 'Church_Affiliation__c',
  'fl_church_attendance': 'Church_Attendance__c',
  'fl_church_name': 'Church_Name__c',
  'fl_church_phone': 'Church_Phone__c',
  'fl_church_website': 'Church_Website__c',
  'fl_church_position': 'Church_Position__c',
  'fl_previous_wtr_attendee': 'Previous_WTR_Attendee__c',
  'fl_referral_for_pastor_rate': 'Referral__c',
  'fl_involvement': 'FL_Involvement__c',
  'fl_title': 'Title__c',
}

/**
 * Maximum length of every string field on Staging_Involvement__c that this sync
 * writes. An over-length value fails the whole allOrNone insert, blocking every
 * record in the run — not just the offending one — so values are truncated to fit.
 *
 * Generated from the production describe endpoint
 * (/services/data/v62.0/sobjects/Staging_Involvement__c/describe) on 2026-07-28.
 * Date, currency and boolean fields are absent because they carry no length.
 *
 * Regenerate after any SF schema change rather than editing by hand — a guessed
 * limit silently truncates valid data.
 */
export const SF_FIELD_MAX_LENGTHS: Readonly<Record<string, number>> = {
  Branch_of_Service__c: 100,
  Church_Affiliation__c: 255,
  Church_Attendance__c: 255,
  Church_City__c: 255,
  Church_Country__c: 100,
  Church_Name__c: 255,
  Church_Phone__c: 50,
  Church_Position__c: 100,
  Church_Postal_Code__c: 20,
  Church_State__c: 255,
  Church_Street__c: 255,
  Church_Street_2__c: 255,
  Church_Website__c: 255,
  Contact_External_Id__c: 255,
  Email_Address__c: 255,
  Email_Subscription_List__c: 100,
  Event_External_Id__c: 255,
  Event_Id__c: 255,
  Event_Location__c: 255,
  Event_Name__c: 255,
  Event_Sponsor_Staff_Email__c: 255,
  Event_Sponsor_Staff_Name__c: 255,
  Event_Type__c: 255,
  First_Name__c: 255,
  FL_Involvement__c: 1000,
  GiftCardAssociatedProduct__c: 100,
  GiftCardGlCode__c: 50,
  GiftCardId__c: 255,
  GiftCardValue__c: 50,
  Group_Name__c: 80,
  Involvement_External_Id__c: 255,
  Involvement_Registration_Type__c: 255,
  Involvement_Status__c: 255,
  Last_Name__c: 255,
  Local_Phone_Number__c: 15,
  Mailing_Address_Line_2__c: 100,
  Mailing_City__c: 255,
  Mailing_Country__c: 50,
  Mailing_Postal_Code__c: 25,
  Mailing_State__c: 255,
  Mailing_Street__c: 255,
  Military_Location__c: 255,
  Payment_Type__c: 100,
  Previous_WTR_Attendee__c: 100,
  Promo_Code__c: 100,
  Referral__c: 1000,
  Registrant_Type__c: 100,
  SMS_Keyword__c: 25,
  Source__c: 255,
  Staging_Type__c: 255,
  Status__c: 255,
  Title__c: 50,
  Waiver__c: 50,
}

// Structured tag that decomposes into multiple SF fields
export const CHURCH_ADDRESS_TAG = 'fl_church_addresss' // note: triple 's' in ERT

export const CHURCH_ADDRESS_FIELD_MAP: Record<string, string> = {
  'address1': 'Church_Street__c',
  'address2': 'Church_Street_2__c',
  'city': 'Church_City__c',
  'state': 'Church_State__c',
  'zip': 'Church_Postal_Code__c',
  'country': 'Church_Country__c',
}

// Event type UUID → display name
export const EVENT_TYPE_MAP: Record<string, string> = {
  '0f87dff6-0115-4d86-8bc7-5e785334b3e2': 'Spring Break',
  'ef6d5e2f-425d-4495-965f-67cbbf76ab2c': 'Spring Break',
  'fe0752b2-7971-4e78-b333-423f5243ec27': 'Winter Conference',
  'ab27b635-339b-4766-9639-0cec51417f65': 'Winter Conference',
  'cfc2b308-566b-432b-bee4-4ed60fec5608': 'Fall Retreat/Getaway',
  '22ccd264-a922-4022-a1b1-642ae97c1cb3': 'Fall Retreat/Getaway',
}

export function getRegistrationStatus(
  completed: boolean,
  withdrawn: boolean,
  checkedInTimestamp: string | null
): string {
  if (completed) {
    if (withdrawn) return 'Canceled'
    if (checkedInTimestamp) return 'Attended'
    return 'Registered'
  }
  return 'Incomplete'
}

export function getFLRegistrationType(registrantTypeName: string): string {
  if (registrantTypeName.includes('Military')) return 'Military'
  if (registrantTypeName.includes('Pastor')) return 'Pastor'
  return 'Attendee'
}

export function getEventTypeName(eventTypeId: string): string {
  return EVENT_TYPE_MAP[eventTypeId] ?? eventTypeId
}

/** Zone assumed when ERT gives a conference no timezone of its own. */
const FALLBACK_TIMEZONE = 'America/New_York'

/**
 * Normalize an ERT timestamp that ALREADY carries a zone (e.g.
 * "2026-02-13T15:28:50.785Z") to Salesforce's format. Precision only — this
 * must never shift the instant.
 *
 * For conference times, which arrive with no zone at all, use
 * localTimeToSalesforce instead.
 */
export function utcTimestampToSalesforce(value: string): string {
  return value.replace(' ', 'T').substring(0, 19) + '.000Z'
}

/**
 * Zone whose calendar date FamilyLife files business records under. Used only
 * for Salesforce DATE columns, which carry no zone of their own.
 */
export const SF_DATE_TIMEZONE = 'America/New_York'

/**
 * Reduce an ERT UTC timestamp to the calendar date a Salesforce DATE column
 * should hold.
 *
 * DATE columns are zone-less: Salesforce stores whatever date it is handed. A
 * full UTC instant therefore filed the *GMT* date, so every registration taken
 * after 20:00 Eastern landed a day late — 21:33 on 9/4 is 01:33Z on 9/5.
 * (Reported by FamilyLife, Sep 2026; 400 of 2000 sampled rows were affected.)
 *
 * Returns null on an unparseable value rather than a guess. Salesforce rejects
 * a malformed DATE and inserts are allOrNone, so one bad value would block the
 * entire run.
 */
export function utcTimestampToSalesforceDate(
  value: string,
  timeZone: string = SF_DATE_TIMEZONE
): string | null {
  // Validate the shape before parsing. V8's fallback parser is lenient enough
  // to read "not a timestamp" as a real date, which would file the record under
  // a silently wrong day — worse than sending nothing.
  const wallClock = value.replace(' ', 'T').substring(0, 19)
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wallClock)
    ? new Date(`${wallClock}Z`)
    : new Date(NaN)

  if (Number.isNaN(instant.getTime())) {
    logger.warn('Unparseable timestamp for a Salesforce date field; sending null', { value })
    return null
  }

  // en-CA renders as YYYY-MM-DD, which is what the SF REST API expects.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/**
 * Convert a zone-less ERT wall-clock time ("2026-09-25 19:00:00") to UTC,
 * interpreting it in `timeZone`.
 *
 * ERT sends conference times with no zone marker and names the zone separately
 * in `eventTimezone`. Every WTR conference starts at 19:00 *local*, so simply
 * appending ".000Z" published each event 4-8 hours early depending on the venue.
 *
 * The offset is resolved for the specific date, so DST is handled: 5 March is
 * PST while 9 July is PDT in the same zone.
 */
export function localTimeToSalesforce(value: string, timeZone: string | undefined): string {
  return localTimeToUtc(value, timeZone).toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

/**
 * The conversion behind localTimeToSalesforce, returning the instant itself.
 *
 * Unparseable input comes back as an Invalid Date rather than throwing —
 * callers decide whether that is fatal (formatting) or ignorable (comparison).
 */
export function localTimeToUtc(value: string, timeZone: string | undefined): Date {
  let zone = timeZone
  if (!zone) {
    logger.warn('Conference has no timezone; assuming Eastern', { value })
    zone = FALLBACK_TIMEZONE
  }

  const wallClock = value.replace(' ', 'T').substring(0, 19)

  // Read the wall-clock as if it were UTC, ask what that instant looks like in
  // the target zone, and the difference is the offset to remove. Applied twice
  // so the offset is measured near the true instant rather than up to a day off,
  // which also settles DST-boundary inputs deterministically.
  const asIfUtc = new Date(`${wallClock}Z`)
  if (Number.isNaN(asIfUtc.getTime())) return asIfUtc // Intl would throw on it

  let result = new Date(asIfUtc.getTime() + offsetMs(asIfUtc, zone))
  result = new Date(asIfUtc.getTime() + offsetMs(result, zone))

  return result
}

/**
 * Whether a conference's event end has passed. Drives post-event suppression:
 * after the event, Salesforce only wants withdrawals (FamilyLife, Aug 2026).
 *
 * Fails open — a missing or unparseable end time reads as "not ended" so the
 * record is sent. Suppressing on bad data would silently drop live traffic,
 * which is the worse failure. (NaN < anything is false, so the garbage case
 * needs no explicit branch.)
 */
export function hasEventEnded(
  eventEndTime: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!eventEndTime) return false
  return localTimeToUtc(eventEndTime, timeZone ?? undefined).getTime() < now.getTime()
}

/** How far `zone` is behind UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const p: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value
  }

  // Intl can render midnight as hour "24".
  const hour = p.hour === '24' ? '00' : p.hour
  const inZone = Date.parse(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}Z`)

  return instant.getTime() - inZone
}
