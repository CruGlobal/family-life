import type { ERTAnswer, ERTAddressValue, ERTNameValue } from '../types/ert.js'
import {
  TAG_TO_SF_FIELD,
  CHURCH_ADDRESS_TAG,
  CHURCH_ADDRESS_FIELD_MAP,
  SF_FIELD_MAX_LENGTHS,
} from './field-mapping.js'
import { logger } from '../utils/logging.js'

export interface BlockLookups {
  titleLookup: Record<string, string>
  profileTypeLookup: Record<string, string | null>
  tagNameLookup: Record<string, string>
}

export interface AnswerProcessingResult {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: {
    address1?: string
    address2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  smsOptIn?: string
  smsKeyword?: string
  emailSubscriptionSignup?: string
  emailSubscriptionList?: string
  title?: string
  tagFields: Record<string, unknown>
}

export function processAnswers(
  answers: ERTAnswer[],
  lookups: BlockLookups,
  existingName: boolean,
  existingEmail: boolean
): AnswerProcessingResult {
  const result: AnswerProcessingResult = {
    tagFields: {}
  }

  for (const answer of answers) {
    const blockId = answer.blockId
    const tagName = lookups.tagNameLookup[blockId]
    const profileType = lookups.profileTypeLookup[blockId]

    // Handle blockTagType-based fields first
    if (tagName) {
      processTagField(result, tagName, answer.value)
      continue
    }

    // Handle profileType-based fields
    switch (profileType) {
      case 'NAME':
        if (!existingName) {
          const nameVal = answer.value as ERTNameValue | null
          if (nameVal?.firstName) result.firstName = nameVal.firstName
          if (nameVal?.lastName) result.lastName = nameVal.lastName
        }
        break

      case 'EMAIL':
        if (!existingEmail && answer.value) {
          result.email = String(answer.value)
        }
        break

      case 'PHONE':
        if (answer.value) {
          const phone = sanitizePhone(String(answer.value))
          if (phone) result.phone = phone
        }
        break

      case 'ADDRESS': {
        const addr = answer.value as ERTAddressValue | null
        if (addr) {
          result.address = {
            address1: addr.address1 || undefined,
            address2: addr.address2 || undefined,
            city: addr.city || undefined,
            state: addr.state || undefined,
            zip: addr.zip || undefined,
            country: addr.country || undefined,
          }
        }
        break
      }

      case 'OPPORTUNITIES':
        processOpportunities(result, answer.value)
        break

      default:
        // No profileType or unhandled type — skip
        break
    }
  }

  return result
}

// Digits and the punctuation that legitimately appears in a phone number.
// Anything else is registrant free text that ERT carried into the answer.
const NON_PHONE_CHARS = /[^0-9+().-]/g

/**
 * Reduce a PHONE answer to a storable number, or undefined if it isn't one.
 *
 * Truncating is deliberately NOT used here: a clipped phone number is a wrong
 * phone number, which is worse than an absent one. An over-length or digitless
 * value is dropped and logged instead.
 */
function sanitizePhone(raw: string): string | undefined {
  const cleaned = raw.replace(/\s/g, '').replace(NON_PHONE_CHARS, '')
  const phone = cleaned.startsWith('+1') ? cleaned.substring(2) : cleaned

  if (!/[0-9]/.test(phone)) {
    if (raw.trim()) logger.warn('Dropping phone answer with no digits', { raw })
    return undefined
  }

  const maxLength = SF_FIELD_MAX_LENGTHS['Local_Phone_Number__c']
  if (maxLength !== undefined && phone.length > maxLength) {
    logger.warn('Dropping over-length phone answer', { raw, sanitized: phone, maxLength })
    return undefined
  }

  return phone
}

function processTagField(
  result: AnswerProcessingResult,
  tagName: string,
  value: unknown
): void {
  // Church address tag returns structured object
  if (tagName === CHURCH_ADDRESS_TAG) {
    if (value && typeof value === 'object') {
      const addr = value as Record<string, string>
      for (const [key, sfField] of Object.entries(CHURCH_ADDRESS_FIELD_MAP)) {
        if (addr[key]) {
          result.tagFields[sfField] = addr[key]
        }
      }
    }
    return
  }

  // Simple 1:1 tag mapping
  const sfField = TAG_TO_SF_FIELD[tagName]
  if (sfField) {
    if (value) {
      result.tagFields[sfField] = value
    } else if (!(sfField in result.tagFields)) {
      result.tagFields[sfField] = ''
    }
  }
}

function processOpportunities(result: AnswerProcessingResult, value: unknown): void {
  if (!value) return
  const val = String(value).toLowerCase()

  let emailSubscriptionSignup = false
  let smsOptIn = false

  if (val === 'yes, via email') {
    emailSubscriptionSignup = true
  } else if (val === 'yes, via text') {
    smsOptIn = true
  } else if (val === 'yes, via email & text') {
    emailSubscriptionSignup = true
    smsOptIn = true
  }

  if (emailSubscriptionSignup) {
    result.emailSubscriptionSignup = 'true'
    result.emailSubscriptionList = 'Campus Opportunities'
  } else {
    result.emailSubscriptionSignup = 'false'
    result.emailSubscriptionList = ''
  }

  if (smsOptIn) {
    result.smsOptIn = 'true'
    result.smsKeyword = 'CRUOPPTY'
  } else {
    result.smsOptIn = 'false'
    result.smsKeyword = ''
  }
}
