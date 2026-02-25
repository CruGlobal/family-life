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
