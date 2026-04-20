export interface StagingInvolvementRecord {
  // Hard-coded static fields
  Status__c: string
  Staging_Type__c: string
  Source__c: string

  // ID fields
  Involvement_External_Id__c: string
  Contact_External_Id__c: string
  Event_External_Id__c: string

  // Contact fields
  First_Name__c?: string
  Last_Name__c: string
  Email_Address__c?: string
  Local_Phone_Number__c?: string
  Title__c?: string

  // Mailing address
  Mailing_Street__c?: string
  Mailing_Address_Line_2__c?: string
  Mailing_City__c?: string
  Mailing_State__c?: string
  Mailing_Postal_Code__c?: string
  Mailing_Country__c?: string

  // Registration fields
  Involvement_Status__c: string
  Involvement_Registration_Type__c?: string
  Registrant_Type__c: string
  Date_Registered__c?: string | null
  Date_Cancelled__c?: string | null
  Date_Check_In__c?: string | null
  ERT_Last_Updated__c?: string | null
  Involvement_Registration_Created_Date__c?: string | null

  // Event fields
  Event_Id__c: string
  Event_Name__c?: string
  Event_Location__c?: string
  Event_Start_Date__c?: string
  Event_End_Date__c?: string
  Event_Sponsor_Staff_Name__c?: string
  Event_Sponsor_Staff_Email__c?: string
  Event_Type__c?: string

  // Payment fields
  Paid_Amount__c?: number
  Payment_Type__c?: string
  Promo_Code__c?: string
  GiftCardId__c?: string
  GiftCardValue__c?: number
  GiftCardAssociatedProduct__c?: string
  GiftCardGlCode__c?: string

  // FamilyLife tag fields
  Group_Name__c?: string
  Branch_of_Service__c?: string
  Military_Location__c?: string
  Church_Affiliation__c?: string
  Church_Attendance__c?: string
  Church_Name__c?: string
  Church_Phone__c?: string
  Church_Position__c?: string
  Church_Website__c?: string
  Previous_WTR_Attendee__c?: string
  Referral__c?: string
  FL_Involvement__c?: string

  // Church address
  Church_Street__c?: string
  Church_Street_2__c?: string
  Church_City__c?: string
  Church_State__c?: string
  Church_Postal_Code__c?: string
  Church_Country__c?: string

  // Opt-in fields
  SMS_Opt_In__c?: string
  SMS_Keyword__c?: string
  Email_Subscription_Signup__c?: string
  Email_Subscription_List__c?: string

  // Other
  Waiver__c?: string
}

export interface InsertResult {
  successCount: number
  errorCount: number
  errors: Array<{ id?: string; message: string }>
}

export interface CompositeResponse {
  compositeResponse: Array<{
    body: Array<{
      id: string | null
      success: boolean
      errors: Array<{ message: string; statusCode: string }>
    }>
    httpHeaders: Record<string, string>
    httpStatusCode: number
    referenceId: string
  }>
}
