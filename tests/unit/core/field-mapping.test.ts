import { describe, it, expect, vi } from 'vitest'
import {
  getRegistrationStatus,
  getFLRegistrationType,
  getEventTypeName,
  utcTimestampToSalesforce,
  utcTimestampToSalesforceDate,
  localTimeToSalesforce,
  hasEventEnded,
  TAG_TO_SF_FIELD,
  CHURCH_ADDRESS_TAG,
  CHURCH_ADDRESS_FIELD_MAP,
  EVENT_TYPE_MAP,
} from '@/core/field-mapping.js'
import { logger } from '@/utils/logging.js'

describe('getRegistrationStatus', () => {
  it('returns Canceled when completed and withdrawn', () => {
    expect(getRegistrationStatus(true, true, null)).toBe('Canceled')
  })

  it('returns Canceled when completed, withdrawn, and checked in', () => {
    expect(getRegistrationStatus(true, true, '2026-01-01T00:00:00Z')).toBe('Canceled')
  })

  it('returns Attended when completed, not withdrawn, and checked in', () => {
    expect(getRegistrationStatus(true, false, '2026-01-01T00:00:00Z')).toBe('Attended')
  })

  it('returns Registered when completed, not withdrawn, not checked in', () => {
    expect(getRegistrationStatus(true, false, null)).toBe('Registered')
  })

  it('returns Incomplete when not completed', () => {
    expect(getRegistrationStatus(false, false, null)).toBe('Incomplete')
  })

  it('returns Incomplete when not completed even if withdrawn', () => {
    expect(getRegistrationStatus(false, true, null)).toBe('Incomplete')
  })
})

describe('getFLRegistrationType', () => {
  it('returns Military for military types', () => {
    expect(getFLRegistrationType('Military Couple')).toBe('Military')
    expect(getFLRegistrationType('Military Individual')).toBe('Military')
  })

  it('returns Pastor for pastor types', () => {
    expect(getFLRegistrationType('Pastor Spouse')).toBe('Pastor')
    expect(getFLRegistrationType('Pastor Individual')).toBe('Pastor')
  })

  it('returns Attendee for other types', () => {
    expect(getFLRegistrationType('Couple')).toBe('Attendee')
    expect(getFLRegistrationType('Individual Attendee')).toBe('Attendee')
    expect(getFLRegistrationType('DEFAULT')).toBe('Attendee')
  })

  it('prefers Military over Pastor if both present', () => {
    expect(getFLRegistrationType('Military Pastor')).toBe('Military')
  })
})

describe('getEventTypeName', () => {
  it('maps Spring Break UUIDs', () => {
    expect(getEventTypeName('0f87dff6-0115-4d86-8bc7-5e785334b3e2')).toBe('Spring Break')
    expect(getEventTypeName('ef6d5e2f-425d-4495-965f-67cbbf76ab2c')).toBe('Spring Break')
  })

  it('maps Winter Conference UUIDs', () => {
    expect(getEventTypeName('fe0752b2-7971-4e78-b333-423f5243ec27')).toBe('Winter Conference')
    expect(getEventTypeName('ab27b635-339b-4766-9639-0cec51417f65')).toBe('Winter Conference')
  })

  it('maps Fall Retreat/Getaway UUIDs', () => {
    expect(getEventTypeName('cfc2b308-566b-432b-bee4-4ed60fec5608')).toBe('Fall Retreat/Getaway')
    expect(getEventTypeName('22ccd264-a922-4022-a1b1-642ae97c1cb3')).toBe('Fall Retreat/Getaway')
  })

  it('passes through unknown UUIDs', () => {
    expect(getEventTypeName('unknown-uuid')).toBe('unknown-uuid')
  })
})

describe('TAG_TO_SF_FIELD', () => {
  it('maps all expected tag names', () => {
    expect(TAG_TO_SF_FIELD['fl_registration_type']).toBe('Involvement_Registration_Type__c')
    expect(TAG_TO_SF_FIELD['fl_group_name']).toBe('Group_Name__c')
    expect(TAG_TO_SF_FIELD['fl_military_branch']).toBe('Branch_of_Service__c')
    expect(TAG_TO_SF_FIELD['fl_military_location']).toBe('Military_Location__c')
    expect(TAG_TO_SF_FIELD['fl_church_affiliation']).toBe('Church_Affiliation__c')
    expect(TAG_TO_SF_FIELD['fl_church_attendance']).toBe('Church_Attendance__c')
    expect(TAG_TO_SF_FIELD['fl_church_name']).toBe('Church_Name__c')
    expect(TAG_TO_SF_FIELD['fl_church_phone']).toBe('Church_Phone__c')
    expect(TAG_TO_SF_FIELD['fl_church_website']).toBe('Church_Website__c')
    expect(TAG_TO_SF_FIELD['fl_church_position']).toBe('Church_Position__c')
    expect(TAG_TO_SF_FIELD['fl_previous_wtr_attendee']).toBe('Previous_WTR_Attendee__c')
    expect(TAG_TO_SF_FIELD['fl_referral_for_pastor_rate']).toBe('Referral__c')
    expect(TAG_TO_SF_FIELD['fl_involvement']).toBe('FL_Involvement__c')
    expect(TAG_TO_SF_FIELD['fl_title']).toBe('Title__c')
  })

  it('has exactly 14 entries', () => {
    expect(Object.keys(TAG_TO_SF_FIELD)).toHaveLength(14)
  })
})

describe('CHURCH_ADDRESS_TAG', () => {
  it('has triple s', () => {
    expect(CHURCH_ADDRESS_TAG).toBe('fl_church_addresss')
  })
})

describe('CHURCH_ADDRESS_FIELD_MAP', () => {
  it('maps all address components', () => {
    expect(CHURCH_ADDRESS_FIELD_MAP['address1']).toBe('Church_Street__c')
    expect(CHURCH_ADDRESS_FIELD_MAP['address2']).toBe('Church_Street_2__c')
    expect(CHURCH_ADDRESS_FIELD_MAP['city']).toBe('Church_City__c')
    expect(CHURCH_ADDRESS_FIELD_MAP['state']).toBe('Church_State__c')
    expect(CHURCH_ADDRESS_FIELD_MAP['zip']).toBe('Church_Postal_Code__c')
    expect(CHURCH_ADDRESS_FIELD_MAP['country']).toBe('Church_Country__c')
  })
})

describe('EVENT_TYPE_MAP', () => {
  it('has 6 entries', () => {
    expect(Object.keys(EVENT_TYPE_MAP)).toHaveLength(6)
  })
})

describe('utcTimestampToSalesforce', () => {
  // For ERT values that already carry a zone. Normalizes precision only —
  // it must never shift the instant.
  it('truncates milliseconds and keeps .000Z', () => {
    expect(utcTimestampToSalesforce('2026-02-13T15:28:50.785Z')).toBe('2026-02-13T15:28:50.000Z')
  })

  it('handles full ISO with Z', () => {
    expect(utcTimestampToSalesforce('2026-03-15T18:30:00Z')).toBe('2026-03-15T18:30:00.000Z')
  })
})

describe('utcTimestampToSalesforceDate', () => {
  // Date_Registered__c and Date_Cancelled__c are Salesforce DATE columns, which
  // carry no zone — Salesforce keeps whatever calendar date it is handed. Given
  // a full UTC instant it took the GMT date, so anything registered after 20:00
  // Eastern was filed a day late. (FamilyLife/Mona Horton, Sep 2026.)
  it.each([
    // [label,                   utc instant,                  expected FL date]
    ['21:33 EDT, rolls in UTC',  '2026-09-05T01:33:00.000Z',   '2026-09-04'],
    ['midday, same day in both', '2026-09-05T13:33:00.000Z',   '2026-09-05'],
    ['23:30 EST, rolls in UTC',  '2026-01-05T04:30:00.000Z',   '2026-01-04'],
    ['00:30 EST, new day',       '2026-01-05T05:30:00.000Z',   '2026-01-05'],
    ['19:59 EDT, before roll',   '2026-09-04T23:59:00.000Z',   '2026-09-04'],
    ['20:00 EDT, at the roll',   '2026-09-05T00:00:00.000Z',   '2026-09-04'],
  ])('takes the Eastern calendar date: %s', (_label, utc, expected) => {
    expect(utcTimestampToSalesforceDate(utc)).toBe(expected)
  })

  it('accepts a space separator as well as a T', () => {
    expect(utcTimestampToSalesforceDate('2026-09-05 01:33:00')).toBe('2026-09-04')
  })

  // An unparseable value must not become a bogus date. Salesforce rejects a
  // malformed DATE and the insert is allOrNone, so one bad value would block
  // every record in the run — null is the safe degradation.
  // V8's fallback date parser is lenient enough to turn junk into a real date
  // ("not a timestamp" once yielded 1999-12-31), which would file a record under
  // a silently wrong day. The shape has to be validated, not just handed to Date.
  it.each([
    ['free text', 'not a timestamp'],
    ['empty string', ''],
    ['date only', '2026-09-05'],
    ['out-of-range parts', '2026-13-45T00:00:00Z'],
  ])('returns null and warns on %s', (_label, value) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    expect(utcTimestampToSalesforceDate(value)).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      'Unparseable timestamp for a Salesforce date field; sending null',
      expect.objectContaining({ value })
    )

    warn.mockRestore()
  })
})

describe('localTimeToSalesforce', () => {
  // ERT sends conference times with no zone at all ("2026-09-25 19:00:00") and
  // names the zone separately. Every WTR event is 19:00 LOCAL, so stamping .000Z
  // onto it published each event 4-8 hours early depending on the venue.
  it.each([
    // [label,        local,                 zone,                  expected UTC]
    ['EDT (-4)',      '2026-09-25 19:00:00', 'America/New_York',    '2026-09-25T23:00:00.000Z'],
    ['EST (-5)',      '2027-02-19 19:00:00', 'America/New_York',    '2027-02-20T00:00:00.000Z'],
    ['CDT (-5)',      '2027-04-30 19:00:00', 'America/Chicago',     '2027-05-01T00:00:00.000Z'],
    ['PST (-8)',      '2027-03-05 19:00:00', 'America/Los_Angeles', '2027-03-06T03:00:00.000Z'],
    ['PDT (-7)',      '2027-07-09 19:00:00', 'America/Los_Angeles', '2027-07-10T02:00:00.000Z'],
    ['MDT (-6)',      '2026-08-14 19:00:00', 'America/Denver',      '2026-08-15T01:00:00.000Z'],
    ['AKDT (-8)',     '2027-03-19 19:00:00', 'America/Anchorage',   '2027-03-20T03:00:00.000Z'],
  ])('converts %s correctly', (_label, local, zone, expected) => {
    expect(localTimeToSalesforce(local, zone)).toBe(expected)
  })

  // Same wall-clock time, same zone, opposite sides of the DST boundary — a
  // fixed offset table would get one of these wrong.
  it('applies the offset in force on that date, not a fixed one', () => {
    const winter = localTimeToSalesforce('2027-01-15 19:00:00', 'America/New_York')
    const summer = localTimeToSalesforce('2027-07-15 19:00:00', 'America/New_York')
    expect(winter).toBe('2027-01-16T00:00:00.000Z') // EST, -5
    expect(summer).toBe('2027-07-15T23:00:00.000Z') // EDT, -4
  })

  it('accepts a T separator as well as a space', () => {
    expect(localTimeToSalesforce('2026-03-15T18:00:00', 'America/New_York'))
      .toBe('2026-03-15T22:00:00.000Z')
  })

  // The spring-forward gap: 02:30 does not exist on this date in New York, so
  // any answer is a choice. This resolves it with the post-transition offset
  // (EDT, -4). What matters is that it is stable and never throws — WTR events
  // are all at 19:00, so the gap is unreachable in practice.
  it('resolves a nonexistent spring-forward time deterministically', () => {
    const first = localTimeToSalesforce('2027-03-14 02:30:00', 'America/New_York')
    const second = localTimeToSalesforce('2027-03-14 02:30:00', 'America/New_York')

    expect(first).toBe('2027-03-14T06:30:00.000Z')
    expect(second).toBe(first)
  })

  it('falls back to Eastern with a warning when the zone is missing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    expect(localTimeToSalesforce('2026-09-25 19:00:00', undefined))
      .toBe('2026-09-25T23:00:00.000Z')
    expect(warn).toHaveBeenCalledWith(
      'Conference has no timezone; assuming Eastern',
      expect.objectContaining({ value: '2026-09-25 19:00:00' })
    )

    warn.mockRestore()
  })
})

describe('hasEventEnded', () => {
  // "2026-05-03 12:00:00" in America/Chicago (CDT, -5) is 17:00:00Z — the
  // Austin event end. The boundary must be evaluated in the event's own zone.
  it('compares against the end time interpreted in the event zone', () => {
    const end = '2026-05-03 12:00:00'
    const zone = 'America/Chicago'

    expect(hasEventEnded(end, zone, new Date('2026-05-03T16:59:00Z'))).toBe(false)
    expect(hasEventEnded(end, zone, new Date('2026-05-03T17:01:00Z'))).toBe(true)
  })

  it('is false well before and true well after the event', () => {
    const end = '2026-03-17 12:00:00'
    const zone = 'America/Chicago'

    expect(hasEventEnded(end, zone, new Date('2026-01-01T00:00:00Z'))).toBe(false)
    expect(hasEventEnded(end, zone, new Date('2026-09-01T00:00:00Z'))).toBe(true)
  })

  // Fail open: bad data must degrade to "send the record" (today's behavior),
  // never to silently dropping live traffic.
  it('fails open when the end time is missing', () => {
    expect(hasEventEnded(null, 'America/Chicago', new Date('2099-01-01T00:00:00Z'))).toBe(false)
    expect(hasEventEnded(undefined, 'America/Chicago', new Date('2099-01-01T00:00:00Z'))).toBe(false)
    expect(hasEventEnded('', 'America/Chicago', new Date('2099-01-01T00:00:00Z'))).toBe(false)
  })

  it('fails open when the end time is unparseable', () => {
    expect(hasEventEnded('not a date', 'America/Chicago', new Date('2099-01-01T00:00:00Z'))).toBe(false)
  })

  it('falls back to Eastern when the zone is missing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    // 12:00 Eastern (EDT, -4) is 16:00Z. A now between 16:00Z and 17:00Z
    // distinguishes the Eastern fallback from a Chicago reading.
    expect(hasEventEnded('2026-05-03 12:00:00', null, new Date('2026-05-03T16:30:00Z'))).toBe(true)
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
