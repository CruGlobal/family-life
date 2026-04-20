import type { ERTAnswer, ERTAddressValue, ERTNameValue } from '../types/ert.js'
import { TAG_TO_SF_FIELD, CHURCH_ADDRESS_TAG, CHURCH_ADDRESS_FIELD_MAP } from './field-mapping.js'

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
          const phone = String(answer.value).replace(/\s/g, '')
          result.phone = phone.startsWith('+1')
            ? phone.substring(2).trim()
            : phone
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
      // Truncate Group_Name__c to 100 chars
      if (sfField === 'Group_Name__c' && typeof value === 'string') {
        result.tagFields[sfField] = value.substring(0, 100)
      } else {
        result.tagFields[sfField] = value
      }
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
