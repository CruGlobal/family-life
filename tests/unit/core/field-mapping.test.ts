import { describe, it, expect } from 'vitest'
import {
  getRegistrationStatus,
  getFLRegistrationType,
  getEventTypeName,
  TAG_TO_SF_FIELD,
  CHURCH_ADDRESS_TAG,
  CHURCH_ADDRESS_FIELD_MAP,
  EVENT_TYPE_MAP,
} from '@/core/field-mapping.js'

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
