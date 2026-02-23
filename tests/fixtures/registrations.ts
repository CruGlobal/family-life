import type { ERTRegistration, ERTRegistrant, ERTAnswer } from '../../src/types/ert.js'

export function makeRegistration(overrides: Partial<ERTRegistration> = {}): ERTRegistration {
  return {
    id: 'reg-001',
    conferenceId: 'conf-001',
    primaryRegistrantId: 'registrant-001',
    completed: true,
    completedTimestamp: '2026-02-01T10:00:00Z',
    lastUpdatedTimestamp: '2026-02-01T10:00:00Z',
    createdTimestamp: '2026-02-01T09:50:00Z',
    totalPaid: 199.99,
    remainingBalance: 0,
    pastPayments: [],
    promotions: [],
    registrants: [makeRegistrant()],
    ...overrides,
  }
}

export function makeRegistrant(overrides: Partial<ERTRegistrant> = {}): ERTRegistrant {
  return {
    id: 'registrant-001',
    registrantTypeId: 'regtype-couple',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    withdrawn: false,
    withdrawnTimestamp: null,
    checkedInTimestamp: null,
    eformStatus: 'completed',
    answers: [],
    ...overrides,
  }
}

export function makeAnswer(overrides: Partial<ERTAnswer> = {}): ERTAnswer {
  return {
    id: 'answer-001',
    blockId: 'block-name-001',
    registrantId: 'registrant-001',
    value: null,
    ...overrides,
  }
}
