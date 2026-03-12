import type { ERTConferenceDetail, ERTRegistrationPage, ERTRegistrantType } from '../../src/types/ert.js'

const WTR_ACTIVITY_ID = 'activity-wtr-001'

export function makeConferenceDetail(overrides: Partial<ERTConferenceDetail> = {}): ERTConferenceDetail {
  return {
    id: 'conf-001',
    name: 'WTR26 Lincoln',
    abbreviation: 'WTR26LNK1',
    archived: false,
    ministry: 'ministry-fl-001',
    ministryActivity: WTR_ACTIVITY_ID,
    eventType: '0f87dff6-0115-4d86-8bc7-5e785334b3e2',
    eventStartTime: '2026-03-15T18:00:00',
    eventEndTime: '2026-03-17T12:00:00',
    locationName: 'Cornhusker Marriott',
    locationAddress: '333 S 13th St',
    locationCity: 'Lincoln',
    locationState: 'NE',
    locationZipCode: '68508',
    contactPersonName: 'John Doe',
    contactPersonEmail: 'john.doe@cru.org',
    registrationPages: makeDefaultRegistrationPages(),
    registrantTypes: makeDefaultRegistrantTypes(),
    ...overrides,
  }
}

export function makeDefaultRegistrationPages(): ERTRegistrationPage[] {
  return [
    {
      id: 'page-001',
      blocks: [
        {
          id: 'block-name-001',
          title: 'Name',
          type: 'nameQuestion',
          profileType: 'NAME',
          blockTagType: null,
        },
        {
          id: 'block-email-001',
          title: 'Email',
          type: 'emailQuestion',
          profileType: 'EMAIL',
          blockTagType: null,
        },
        {
          id: 'block-phone-001',
          title: 'Phone',
          type: 'phoneQuestion',
          profileType: 'PHONE',
          blockTagType: null,
        },
        {
          id: 'block-address-001',
          title: 'Address',
          type: 'addressQuestion',
          profileType: 'ADDRESS',
          blockTagType: null,
        },
        {
          id: 'block-opps-001',
          title: 'Stay connected',
          type: 'radioQuestion',
          profileType: 'OPPORTUNITIES',
          blockTagType: null,
        },
        {
          id: 'block-group-001',
          title: 'Group Name',
          type: 'textQuestion',
          profileType: null,
          blockTagType: { id: 'tag-group-001', name: 'fl_group_name', prettyName: 'Group Name' },
        },
        {
          id: 'block-mil-branch-001',
          title: 'Branch of Service',
          type: 'selectQuestion',
          profileType: null,
          blockTagType: { id: 'tag-mil-001', name: 'fl_military_branch', prettyName: 'Military Branch' },
        },
        {
          id: 'block-church-addr-001',
          title: 'Church Address',
          type: 'addressQuestion',
          profileType: null,
          blockTagType: { id: 'tag-church-addr-001', name: 'fl_church_addresss', prettyName: 'Church Address' },
        },
        {
          id: 'block-title-001',
          title: 'Title/Prefix',
          type: 'selectQuestion',
          profileType: null,
          blockTagType: { id: 'tag-title-001', name: 'fl_title', prettyName: 'Title' },
        },
        {
          id: 'block-regtype-001',
          title: 'Registration Type',
          type: 'selectQuestion',
          profileType: null,
          blockTagType: { id: 'tag-regtype-001', name: 'fl_registration_type', prettyName: 'Registration Type' },
        },
      ],
    },
  ]
}

export function makeDefaultRegistrantTypes(): ERTRegistrantType[] {
  return [
    { id: 'regtype-couple', name: 'Couple' },
    { id: 'regtype-military', name: 'Military Couple' },
    { id: 'regtype-pastor', name: 'Pastor Spouse' },
    { id: 'regtype-attendee', name: 'Individual Attendee' },
  ]
}
