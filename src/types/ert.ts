export interface ERTBlockTagType {
  id: string
  name: string
  prettyName: string
  ministryId?: string
}

export interface ERTConferenceDetail {
  id: string
  name: string
  abbreviation: string | null
  archived: boolean
  ministry: string | null
  ministryActivity: string | null
  eventType: string | null
  eventStartTime: string
  eventEndTime: string
  locationName: string | null
  locationAddress: string | null
  locationCity: string | null
  locationState: string | null
  locationZipCode: string | null
  contactPersonName: string | null
  contactPersonEmail: string | null
  registrationPages: ERTRegistrationPage[]
  registrantTypes: ERTRegistrantType[]
}

export interface ERTRegistrationPage {
  id: string
  blocks: ERTBlock[]
}

export interface ERTBlock {
  id: string
  title: string
  type: string
  profileType: string | null
  blockTagType: ERTBlockTagType | null
}

export interface ERTRegistrantType {
  id: string
  name: string
}

export interface ERTRegistration {
  id: string
  conferenceId: string
  primaryRegistrantId: string
  completed: boolean
  completedTimestamp: string | null
  lastUpdatedTimestamp: string | null
  createdTimestamp: string | null
  totalPaid: number
  remainingBalance: number
  pastPayments: ERTPayment[]
  promotions: ERTPromotion[]
  globalPromotions: ERTPromotion[]
  registrants: ERTRegistrant[]
}

export interface ERTRegistrant {
  id: string
  registrantTypeId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  withdrawn: boolean
  withdrawnTimestamp: string | null
  checkedInTimestamp: string | null
  eformStatus: string | null
  answers: ERTAnswer[]
}

export interface ERTAnswer {
  id: string
  blockId: string
  registrantId: string
  value: unknown
}

export interface ERTPayment {
  paymentType: string
  transactionDatetime: string | null
  transactionId: string | null
  refundedPaymentId: string | null
  creditCard: ERTCreditCard | null
  giftCard: ERTGiftCard | null
}

export interface ERTCreditCard {
  nameOnCard: string
  lastFourDigits: string
}

export interface ERTGiftCard {
  giftCardId: string
  giftCardValue: number
  giftCardAssociatedProduct: string
  giftCardGlCode: string
}

export interface ERTPromotion {
  code: string
  description: string
}

export interface ERTPaginatedResponse<T> {
  registrations: T[]
  meta: {
    totalRegistrants: number
    totalRegistrantsFilter: number
    currentPage: number
    totalPages: number
  }
}

export interface ERTAddressValue {
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface ERTNameValue {
  firstName?: string
  lastName?: string
}
