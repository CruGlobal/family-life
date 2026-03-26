import type { ERTRegistration, ERTRegistrant, ERTConferenceDetail } from '../types/ert.js'
import type { StagingInvolvementRecord } from '../types/salesforce.js'
import type { BlockLookups } from './answer-processor.js'
import { processAnswers } from './answer-processor.js'
import {
  getRegistrationStatus,
  getFLRegistrationType,
  getEventTypeName,
  toSalesforceDateTime,
} from './field-mapping.js'

export interface TransformContext {
  conference: ERTConferenceDetail
  lookups: BlockLookups
  regTypeNameLookup: Record<string, string>
}

export function transformRegistrant(
  registration: ERTRegistration,
  registrant: ERTRegistrant,
  context: TransformContext
): StagingInvolvementRecord | null {
  // Skip if no name
  if (!registrant.firstName && !registrant.lastName) {
    // Check answers for name before giving up
    const hasName = registrant.lastName || registrant.firstName
    if (!hasName) {
      // Process answers to try to find name
      const answerResult = processAnswers(
        registrant.answers || [],
        context.lookups,
        false,
        false
      )
      if (!answerResult.lastName) return null
    }
  }

  // Skip incomplete registrations
  if (!registration.completed) return null

  const conf = context.conference
  const registrantTypeName = context.regTypeNameLookup[registrant.registrantTypeId] || 'DEFAULT'

  // Process answers
  const existingName = !!(registrant.lastName)
  const existingEmail = !!(registrant.email)
  const answerResult = processAnswers(
    registrant.answers || [],
    context.lookups,
    existingName,
    existingEmail
  )

  // Build registration status
  const status = getRegistrationStatus(
    registration.completed,
    registrant.withdrawn,
    registrant.checkedInTimestamp
  )

  // Determine FL registration type: prefer tag, fall back to parsed from registrant type
  const flRegType = answerResult.tagFields['Involvement_Registration_Type__c'] as string | undefined
    || getFLRegistrationType(registrantTypeName)

  // Build the SF record
  const record: StagingInvolvementRecord = {
    // Static fields
    Status__c: 'Ready to Process',
    Staging_Type__c: 'Registration',
    Source__c: 'ERT',

    // ID fields
    Involvement_External_Id__c: `ERTREG-${registration.id}`,
    Contact_External_Id__c: `ERTPER-${registrant.id}`,
    Event_External_Id__c: `ERTCON-${conf.id}`,

    // Contact fields
    Last_Name__c: registrant.lastName || answerResult.lastName || '',
    Involvement_Status__c: status,
    Registrant_Type__c: registrantTypeName,
    Event_Id__c: conf.abbreviation || '',
  }

  // Conditional contact fields (discardIfEmpty / not empty)
  const firstName = registrant.firstName || answerResult.firstName
  if (firstName) record.First_Name__c = firstName

  const email = registrant.email || answerResult.email
  if (email) record.Email_Address__c = email

  if (answerResult.phone) record.Local_Phone_Number__c = answerResult.phone

  // Title from tag
  if (answerResult.tagFields['Title__c']) {
    record.Title__c = answerResult.tagFields['Title__c'] as string
  }

  // Mailing address
  if (answerResult.address) {
    if (answerResult.address.address1) record.Mailing_Street__c = answerResult.address.address1
    if (answerResult.address.address2) record.Mailing_Address_Line_2__c = answerResult.address.address2
    if (answerResult.address.city) record.Mailing_City__c = answerResult.address.city
    if (answerResult.address.state) record.Mailing_State__c = answerResult.address.state
    if (answerResult.address.zip) record.Mailing_Postal_Code__c = answerResult.address.zip
  }

  // Registration type
  record.Involvement_Registration_Type__c = flRegType

  // Dates
  record.Date_Registered__c = registration.completedTimestamp || null
  record.Date_Cancelled__c = registrant.withdrawnTimestamp || null
  record.Date_Check_In__c = registrant.checkedInTimestamp || null
  record.ERT_Last_Updated__c = registration.lastUpdatedTimestamp || null
  record.Involvement_Registration_Created_Date__c = registration.lastUpdatedTimestamp
    ? toSalesforceDateTime(registration.lastUpdatedTimestamp)
    : null

  // Event fields (conditional: not empty)
  if (conf.name) record.Event_Name__c = conf.name
  if (conf.locationName) record.Event_Location__c = conf.locationName
  if (conf.eventStartTime) record.Event_Start_Date__c = toSalesforceDateTime(conf.eventStartTime)
  if (conf.eventEndTime) record.Event_End_Date__c = toSalesforceDateTime(conf.eventEndTime)
  if (conf.contactPersonName) record.Event_Sponsor_Staff_Name__c = conf.contactPersonName
  if (conf.contactPersonEmail) record.Event_Sponsor_Staff_Email__c = conf.contactPersonEmail
  record.Event_Type__c = getEventTypeName(conf.eventType || '')

  // Payment fields
  record.Paid_Amount__c = registration.totalPaid
  if (registration.pastPayments && registration.pastPayments.length > 0) {
    const lastPayment = registration.pastPayments[registration.pastPayments.length - 1]
    record.Payment_Type__c = lastPayment.paymentType || ''
    if (lastPayment.giftCard) {
      record.GiftCardId__c = lastPayment.giftCard.giftCardId
      record.GiftCardValue__c = lastPayment.giftCard.giftCardValue
      record.GiftCardAssociatedProduct__c = lastPayment.giftCard.giftCardAssociatedProduct
      record.GiftCardGlCode__c = lastPayment.giftCard.giftCardGlCode
    }
  }

  // Promo code (prefer globalPromotions, fall back to promotions)
  const promo = registration.globalPromotions?.[0] || registration.promotions?.[0]
  if (promo) {
    record.Promo_Code__c = promo.code || ''
  }

  // Waiver
  if (registrant.eformStatus) record.Waiver__c = registrant.eformStatus

  // Opt-in fields
  if (answerResult.smsOptIn !== undefined) {
    record.SMS_Opt_In__c = answerResult.smsOptIn
    record.SMS_Keyword__c = answerResult.smsKeyword
  }
  if (answerResult.emailSubscriptionSignup !== undefined) {
    record.Email_Subscription_Signup__c = answerResult.emailSubscriptionSignup
    record.Email_Subscription_List__c = answerResult.emailSubscriptionList
  }

  // Tag fields (excluding Involvement_Registration_Type__c and Title__c already handled)
  for (const [sfField, value] of Object.entries(answerResult.tagFields)) {
    if (sfField === 'Involvement_Registration_Type__c') continue
    if (sfField === 'Title__c') continue
    ;(record as unknown as Record<string, unknown>)[sfField] = value
  }

  return record
}
