import type { BlockLookups } from '../../src/core/answer-processor.js'

export function makeBlockLookups(overrides: Partial<BlockLookups> = {}): BlockLookups {
  return {
    titleLookup: {
      'block-name-001': 'Name',
      'block-email-001': 'Email',
      'block-phone-001': 'Phone',
      'block-address-001': 'Address',
      'block-opps-001': 'Stay connected',
      'block-group-001': 'Group Name',
      'block-mil-branch-001': 'Branch of Service',
      'block-church-addr-001': 'Church Address',
      'block-title-001': 'Title/Prefix',
      'block-regtype-001': 'Registration Type',
      ...overrides.titleLookup,
    },
    profileTypeLookup: {
      'block-name-001': 'NAME',
      'block-email-001': 'EMAIL',
      'block-phone-001': 'PHONE',
      'block-address-001': 'ADDRESS',
      'block-opps-001': 'OPPORTUNITIES',
      'block-group-001': null,
      'block-mil-branch-001': null,
      'block-church-addr-001': null,
      'block-title-001': null,
      'block-regtype-001': null,
      ...overrides.profileTypeLookup,
    },
    tagNameLookup: {
      'block-group-001': 'fl_group_name',
      'block-mil-branch-001': 'fl_military_branch',
      'block-church-addr-001': 'fl_church_addresss',
      'block-title-001': 'fl_title',
      'block-regtype-001': 'fl_registration_type',
      ...overrides.tagNameLookup,
    },
  }
}
