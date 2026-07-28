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

// Structured tag that decomposes into multiple SF fields
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

/**
 * Normalize a datetime string to Salesforce ISO format: YYYY-MM-DDTHH:mm:ss.000Z
 * Matches Celigo's extractDateFormat "YYYY-MM-DDTHH:mm:ss" behavior:
 * parses up to seconds precision, outputs with .000Z.
 */
export function toSalesforceDateTime(value: string): string {
  const normalized = value.replace(' ', 'T')
  return normalized.substring(0, 19) + '.000Z'
}
