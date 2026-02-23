import { describe, it, expect } from 'vitest'
import { processAnswers } from '@/core/answer-processor.js'
import { makeBlockLookups } from '../../fixtures/blocks.js'
import { makeAnswer } from '../../fixtures/registrations.js'

describe('processAnswers', () => {
  const lookups = makeBlockLookups()

  describe('NAME profileType', () => {
    it('extracts name from answer when no existing name', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-name-001',
          value: { firstName: 'John', lastName: 'Doe' },
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.firstName).toBe('John')
      expect(result.lastName).toBe('Doe')
    })

    it('skips name extraction when existing name exists', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-name-001',
          value: { firstName: 'John', lastName: 'Doe' },
        }),
      ]

      const result = processAnswers(answers, lookups, true, false)
      expect(result.firstName).toBeUndefined()
      expect(result.lastName).toBeUndefined()
    })

    it('handles partial name (only firstName)', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-name-001',
          value: { firstName: 'John' },
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.firstName).toBe('John')
      expect(result.lastName).toBeUndefined()
    })
  })

  describe('EMAIL profileType', () => {
    it('extracts email when no existing email', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-email-001',
          value: 'john@example.com',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.email).toBe('john@example.com')
    })

    it('skips email when existing email exists', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-email-001',
          value: 'john@example.com',
        }),
      ]

      const result = processAnswers(answers, lookups, false, true)
      expect(result.email).toBeUndefined()
    })
  })

  describe('PHONE profileType', () => {
    it('strips +1 prefix from US numbers', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-phone-001',
          value: '+1 555-123-4567',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.phone).toBe('555-123-4567')
    })

    it('keeps non-US numbers as-is', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-phone-001',
          value: '555-123-4567',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.phone).toBe('555-123-4567')
    })

    it('handles +1 without space', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-phone-001',
          value: '+15551234567',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.phone).toBe('5551234567')
    })
  })

  describe('ADDRESS profileType', () => {
    it('decomposes address object', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-address-001',
          value: {
            address1: '123 Main St',
            address2: 'Apt 4',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
          },
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.address).toEqual({
        address1: '123 Main St',
        address2: 'Apt 4',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
      })
    })

    it('omits empty address fields', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-address-001',
          value: {
            address1: '123 Main St',
            address2: '',
            city: 'Springfield',
            state: '',
            zip: '62701',
          },
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.address?.address2).toBeUndefined()
      expect(result.address?.state).toBeUndefined()
    })
  })

  describe('OPPORTUNITIES profileType', () => {
    it('handles "yes, via email"', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-opps-001',
          value: 'Yes, via email',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.emailSubscriptionSignup).toBe('true')
      expect(result.emailSubscriptionList).toBe('Campus Opportunities')
      expect(result.smsOptIn).toBe('false')
      expect(result.smsKeyword).toBe('')
    })

    it('handles "yes, via text"', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-opps-001',
          value: 'Yes, via text',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.smsOptIn).toBe('true')
      expect(result.smsKeyword).toBe('CRUOPPTY')
      expect(result.emailSubscriptionSignup).toBe('false')
      expect(result.emailSubscriptionList).toBe('')
    })

    it('handles "yes, via email & text"', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-opps-001',
          value: 'Yes, via email & text',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.emailSubscriptionSignup).toBe('true')
      expect(result.emailSubscriptionList).toBe('Campus Opportunities')
      expect(result.smsOptIn).toBe('true')
      expect(result.smsKeyword).toBe('CRUOPPTY')
    })

    it('handles "no" opt-in', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-opps-001',
          value: 'No',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.emailSubscriptionSignup).toBe('false')
      expect(result.smsOptIn).toBe('false')
    })
  })

  describe('tag fields', () => {
    it('maps simple tag to SF field', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-mil-branch-001',
          value: 'Army',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Branch_of_Service__c']).toBe('Army')
    })

    it('truncates fl_group_name to 100 chars', () => {
      const longName = 'A'.repeat(150)
      const answers = [
        makeAnswer({
          blockId: 'block-group-001',
          value: longName,
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Group_Name__c']).toBe('A'.repeat(100))
    })

    it('decomposes church address tag', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-church-addr-001',
          value: {
            address1: '456 Church Rd',
            address2: '',
            city: 'Denver',
            state: 'CO',
            zip: '80201',
            country: 'US',
          },
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Church_Street__c']).toBe('456 Church Rd')
      expect(result.tagFields['Church_City__c']).toBe('Denver')
      expect(result.tagFields['Church_State__c']).toBe('CO')
      expect(result.tagFields['Church_Postal_Code__c']).toBe('80201')
      expect(result.tagFields['Church_Country__c']).toBe('US')
      // Empty address2 should not be set
      expect(result.tagFields['Church_Street_2__c']).toBeUndefined()
    })

    it('maps fl_title tag', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-title-001',
          value: 'Mr.',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Title__c']).toBe('Mr.')
    })

    it('maps fl_registration_type tag', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-regtype-001',
          value: 'Pastor',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Involvement_Registration_Type__c']).toBe('Pastor')
    })

    it('initializes empty tag field if value is falsy and not already set', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-mil-branch-001',
          value: null,
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Branch_of_Service__c']).toBe('')
    })

    it('does not overwrite existing tag value with empty', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-mil-branch-001',
          value: 'Navy',
        }),
        makeAnswer({
          id: 'answer-002',
          blockId: 'block-mil-branch-001',
          value: null,
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.tagFields['Branch_of_Service__c']).toBe('Navy')
    })
  })

  describe('multiple answers', () => {
    it('processes all answer types together', () => {
      const answers = [
        makeAnswer({
          blockId: 'block-name-001',
          value: { firstName: 'Jane', lastName: 'Doe' },
        }),
        makeAnswer({
          id: 'a2',
          blockId: 'block-email-001',
          value: 'jane@example.com',
        }),
        makeAnswer({
          id: 'a3',
          blockId: 'block-phone-001',
          value: '+1 303-555-0100',
        }),
        makeAnswer({
          id: 'a4',
          blockId: 'block-group-001',
          value: 'Small Group Alpha',
        }),
      ]

      const result = processAnswers(answers, lookups, false, false)
      expect(result.firstName).toBe('Jane')
      expect(result.lastName).toBe('Doe')
      expect(result.email).toBe('jane@example.com')
      expect(result.phone).toBe('303-555-0100')
      expect(result.tagFields['Group_Name__c']).toBe('Small Group Alpha')
    })
  })

  describe('empty answers', () => {
    it('returns empty result for no answers', () => {
      const result = processAnswers([], lookups, false, false)
      expect(result.firstName).toBeUndefined()
      expect(result.lastName).toBeUndefined()
      expect(result.email).toBeUndefined()
      expect(result.phone).toBeUndefined()
      expect(result.address).toBeUndefined()
      expect(Object.keys(result.tagFields)).toHaveLength(0)
    })
  })
})
