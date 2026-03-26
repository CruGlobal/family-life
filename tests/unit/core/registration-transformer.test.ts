import { describe, it, expect } from 'vitest'
import { transformRegistrant, type TransformContext } from '@/core/registration-transformer.js'
import { makeConferenceDetail } from '../../fixtures/conferences.js'
import { makeRegistration, makeRegistrant, makeAnswer } from '../../fixtures/registrations.js'
import { makeBlockLookups } from '../../fixtures/blocks.js'

function makeContext(overrides?: Partial<TransformContext>): TransformContext {
  return {
    conference: makeConferenceDetail(),
    lookups: makeBlockLookups(),
    regTypeNameLookup: {
      'regtype-couple': 'Couple',
      'regtype-military': 'Military Couple',
      'regtype-pastor': 'Pastor Spouse',
      'regtype-attendee': 'Individual Attendee',
    },
    ...overrides,
  }
}

describe('transformRegistrant', () => {
  describe('static fields', () => {
    it('sets static SF fields', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant()
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Status__c).toBe('Ready to Process')
      expect(record.Staging_Type__c).toBe('Registration')
      expect(record.Source__c).toBe('ERT')
    })
  })

  describe('ID fields', () => {
    it('prefixes IDs correctly', () => {
      const reg = makeRegistration({ id: 'reg-abc' })
      const registrant = makeRegistrant({ id: 'person-xyz' })
      const ctx = makeContext({ conference: makeConferenceDetail({ id: 'conf-123' }) })

      const record = transformRegistrant(reg, registrant, ctx)!

      expect(record.Involvement_External_Id__c).toBe('ERTREG-reg-abc')
      expect(record.Contact_External_Id__c).toBe('ERTPER-person-xyz')
      expect(record.Event_External_Id__c).toBe('ERTCON-conf-123')
    })
  })

  describe('contact fields', () => {
    it('maps contact fields from registrant', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.First_Name__c).toBe('Jane')
      expect(record.Last_Name__c).toBe('Smith')
      expect(record.Email_Address__c).toBe('jane@test.com')
    })

    it('omits First_Name__c when empty (discardIfEmpty)', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({ firstName: null, lastName: 'Smith' })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.First_Name__c).toBeUndefined()
    })

    it('falls back to answer name when registrant has no name', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({
        firstName: null,
        lastName: null,
        answers: [
          makeAnswer({
            blockId: 'block-name-001',
            value: { firstName: 'FromAnswer', lastName: 'AlsoFromAnswer' },
          }),
        ],
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.First_Name__c).toBe('FromAnswer')
      expect(record.Last_Name__c).toBe('AlsoFromAnswer')
    })
  })

  describe('filtering', () => {
    it('returns null for incomplete registration', () => {
      const reg = makeRegistration({ completed: false })
      const registrant = makeRegistrant()
      const record = transformRegistrant(reg, registrant, makeContext())

      expect(record).toBeNull()
    })

    it('returns null when registrant has no name and answer has no name', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({
        firstName: null,
        lastName: null,
        answers: [],
      })
      const record = transformRegistrant(reg, registrant, makeContext())

      expect(record).toBeNull()
    })
  })

  describe('registration status', () => {
    it('sets Registered for completed, not withdrawn, not checked in', () => {
      const reg = makeRegistration({ completed: true })
      const registrant = makeRegistrant({ withdrawn: false, checkedInTimestamp: null })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Status__c).toBe('Registered')
    })

    it('sets Attended for completed with checkedInTimestamp', () => {
      const reg = makeRegistration({ completed: true })
      const registrant = makeRegistrant({
        withdrawn: false,
        checkedInTimestamp: '2026-03-15T18:30:00Z',
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Status__c).toBe('Attended')
    })

    it('sets Canceled for completed and withdrawn', () => {
      const reg = makeRegistration({ completed: true })
      const registrant = makeRegistrant({
        withdrawn: true,
        withdrawnTimestamp: '2026-03-10T12:00:00Z',
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Status__c).toBe('Canceled')
    })
  })

  describe('FL registration type', () => {
    it('uses tag value when present', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({
        answers: [
          makeAnswer({
            blockId: 'block-regtype-001',
            value: 'Pastor',
          }),
        ],
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Registration_Type__c).toBe('Pastor')
    })

    it('parses from registrant type name when no tag', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({ registrantTypeId: 'regtype-military' })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Registration_Type__c).toBe('Military')
    })

    it('defaults to Attendee for generic types', () => {
      const reg = makeRegistration()
      const registrant = makeRegistrant({ registrantTypeId: 'regtype-couple' })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Involvement_Registration_Type__c).toBe('Attendee')
    })
  })

  describe('event fields', () => {
    it('maps event fields from conference', () => {
      const record = transformRegistrant(
        makeRegistration(),
        makeRegistrant(),
        makeContext()
      )!

      expect(record.Event_Id__c).toBe('WTR26LNK1')
      expect(record.Event_Name__c).toBe('WTR26 Lincoln')
      expect(record.Event_Location__c).toBe('Cornhusker Marriott')
      expect(record.Event_Start_Date__c).toBe('2026-03-15T18:00:00.000Z')
      expect(record.Event_End_Date__c).toBe('2026-03-17T12:00:00.000Z')
      expect(record.Event_Sponsor_Staff_Name__c).toBe('John Doe')
      expect(record.Event_Sponsor_Staff_Email__c).toBe('john.doe@cru.org')
      expect(record.Event_Type__c).toBe('Spring Break')
    })

    it('omits conditional event fields when empty', () => {
      const conf = makeConferenceDetail({
        locationName: '',
        contactPersonName: '',
        contactPersonEmail: '',
      })
      const record = transformRegistrant(
        makeRegistration(),
        makeRegistrant(),
        makeContext({ conference: conf })
      )!

      expect(record.Event_Location__c).toBeUndefined()
      expect(record.Event_Sponsor_Staff_Name__c).toBeUndefined()
      expect(record.Event_Sponsor_Staff_Email__c).toBeUndefined()
    })
  })

  describe('date fields', () => {
    it('maps registration dates', () => {
      const reg = makeRegistration({
        completedTimestamp: '2026-02-01T10:00:00Z',
        lastUpdatedTimestamp: '2026-02-05T12:00:00Z',
      })
      const registrant = makeRegistrant({
        withdrawnTimestamp: null,
        checkedInTimestamp: '2026-03-15T18:30:00Z',
      })
      const record = transformRegistrant(reg, registrant, makeContext())!

      expect(record.Date_Registered__c).toBe('2026-02-01T10:00:00Z')
      expect(record.Date_Cancelled__c).toBeNull()
      expect(record.Date_Check_In__c).toBe('2026-03-15T18:30:00Z')
      expect(record.ERT_Last_Updated__c).toBe('2026-02-05T12:00:00Z')
      expect(record.Involvement_Registration_Created_Date__c).toBe('2026-02-05T12:00:00.000Z')
    })
  })

  describe('payment fields', () => {
    it('maps basic payment info', () => {
      const reg = makeRegistration({ totalPaid: 299.99 })
      const record = transformRegistrant(reg, makeRegistrant(), makeContext())!

      expect(record.Paid_Amount__c).toBe(299.99)
    })

    it('extracts payment type from last payment', () => {
      const reg = makeRegistration({
        pastPayments: [
          {
            paymentType: 'CREDIT_CARD',
            transactionDatetime: null,
            transactionId: null,
            refundedPaymentId: null,
            creditCard: { nameOnCard: 'Jane Smith', lastFourDigits: '4242' },
            giftCard: null,
          },
        ],
      })
      const record = transformRegistrant(reg, makeRegistrant(), makeContext())!

      expect(record.Payment_Type__c).toBe('CREDIT_CARD')
    })

    it('extracts gift card from last payment', () => {
      const reg = makeRegistration({
        pastPayments: [
          {
            paymentType: 'GIFT_CARD',
            transactionDatetime: null,
            transactionId: null,
            refundedPaymentId: null,
            creditCard: null,
            giftCard: {
              giftCardId: 'gc-001',
              giftCardValue: 50,
              giftCardAssociatedProduct: 'WTR',
              giftCardGlCode: 'GL-123',
            },
          },
        ],
      })
      const record = transformRegistrant(reg, makeRegistrant(), makeContext())!

      expect(record.GiftCardId__c).toBe('gc-001')
      expect(record.GiftCardValue__c).toBe(50)
      expect(record.GiftCardAssociatedProduct__c).toBe('WTR')
      expect(record.GiftCardGlCode__c).toBe('GL-123')
    })

    it('prefers globalPromotions over promotions', () => {
      const reg = makeRegistration({
        globalPromotions: [
          { code: 'GLOBAL100', description: 'Global promo' },
        ],
        promotions: [
          { code: 'EARLYBIRD', description: 'Early bird discount' },
        ],
      })
      const record = transformRegistrant(reg, makeRegistrant(), makeContext())!

      expect(record.Promo_Code__c).toBe('GLOBAL100')
    })

    it('falls back to promotions when globalPromotions is empty', () => {
      const reg = makeRegistration({
        globalPromotions: [],
        promotions: [
          { code: 'EARLYBIRD', description: 'Early bird discount' },
          { code: 'ANOTHER', description: 'Another promo' },
        ],
      })
      const record = transformRegistrant(reg, makeRegistrant(), makeContext())!

      expect(record.Promo_Code__c).toBe('EARLYBIRD')
    })
  })

  describe('waiver', () => {
    it('maps eformStatus to Waiver__c', () => {
      const registrant = makeRegistrant({ eformStatus: 'completed' })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Waiver__c).toBe('completed')
    })

    it('omits Waiver__c when no eformStatus', () => {
      const registrant = makeRegistrant({ eformStatus: null })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Waiver__c).toBeUndefined()
    })
  })

  describe('tag fields in output', () => {
    it('includes church address decomposed fields', () => {
      const registrant = makeRegistrant({
        answers: [
          makeAnswer({
            blockId: 'block-church-addr-001',
            value: {
              address1: '100 Church Ln',
              city: 'Denver',
              state: 'CO',
              zip: '80201',
              country: 'US',
            },
          }),
        ],
      })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Church_Street__c).toBe('100 Church Ln')
      expect(record.Church_City__c).toBe('Denver')
      expect(record.Church_State__c).toBe('CO')
      expect(record.Church_Postal_Code__c).toBe('80201')
      expect(record.Church_Country__c).toBe('US')
    })

    it('includes title from fl_title tag', () => {
      const registrant = makeRegistrant({
        answers: [
          makeAnswer({
            blockId: 'block-title-001',
            value: 'Mrs.',
          }),
        ],
      })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Title__c).toBe('Mrs.')
    })
  })

  describe('opt-in fields', () => {
    it('includes opt-in fields from OPPORTUNITIES answer', () => {
      const registrant = makeRegistrant({
        answers: [
          makeAnswer({
            blockId: 'block-opps-001',
            value: 'Yes, via email & text',
          }),
        ],
      })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.SMS_Opt_In__c).toBe('true')
      expect(record.SMS_Keyword__c).toBe('CRUOPPTY')
      expect(record.Email_Subscription_Signup__c).toBe('true')
      expect(record.Email_Subscription_List__c).toBe('Campus Opportunities')
    })
  })

  describe('registrant type', () => {
    it('maps registrant type name', () => {
      const registrant = makeRegistrant({ registrantTypeId: 'regtype-pastor' })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Registrant_Type__c).toBe('Pastor Spouse')
    })

    it('defaults to DEFAULT for unknown type', () => {
      const registrant = makeRegistrant({ registrantTypeId: 'unknown-type' })
      const record = transformRegistrant(makeRegistration(), registrant, makeContext())!

      expect(record.Registrant_Type__c).toBe('DEFAULT')
    })
  })
})
