/**
 * Salesforce PoC - Verifies:
 * 1. OAuth 2.0 client_credentials auth works
 * 2. Staging_Involvement_Object__c exists and has expected fields
 * 3. A test insert succeeds (then deletes the test record)
 */
import 'dotenv/config'

const SF_LOGIN_URL = process.env.SF_LOGIN_URL
const SF_CLIENT_ID = process.env.SF_CLIENT_ID
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET

if (!SF_LOGIN_URL || !SF_CLIENT_ID || !SF_CLIENT_SECRET) {
  console.error('Missing SF_LOGIN_URL, SF_CLIENT_ID, or SF_CLIENT_SECRET in .env')
  process.exit(1)
}

// --- Step 1: OAuth 2.0 client_credentials auth ---
console.log('\n=== Step 1: OAuth 2.0 client_credentials auth ===')
console.log(`Token endpoint: ${SF_LOGIN_URL}/services/oauth2/token`)

const tokenResponse = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  }),
})

if (!tokenResponse.ok) {
  const body = await tokenResponse.text()
  console.error(`Auth FAILED (${tokenResponse.status}): ${body}`)
  process.exit(1)
}

const tokenData = await tokenResponse.json()
console.log('Auth SUCCESS')
console.log(`  instance_url: ${tokenData.instance_url}`)
console.log(`  token_type: ${tokenData.token_type}`)
console.log(`  access_token: ${tokenData.access_token.substring(0, 20)}...`)

const instanceUrl = tokenData.instance_url
const accessToken = tokenData.access_token
const apiBase = `${instanceUrl}/services/data/v62.0`

async function sfRequest(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SF API ${res.status}: ${body}`)
  }
  return res.json()
}

// --- Step 2: Describe Staging_Involvement_Object__c ---
console.log('\n=== Step 2: Describe Staging_Involvement_Object__c ===')

let describe
try {
  describe = await sfRequest('/sobjects/Staging_Involvement_Object__c/describe')
  console.log(`Object found: ${describe.name} (label: "${describe.label}")`)
  console.log(`  Total fields: ${describe.fields.length}`)
  console.log(`  Createable: ${describe.createable}`)
  console.log(`  Deletable: ${describe.deletable}`)
} catch (err) {
  console.error(`Describe FAILED: ${err.message}`)
  process.exit(1)
}

// --- Step 3: Validate our field names exist ---
console.log('\n=== Step 3: Field validation ===')

const OUR_FIELDS = [
  'Status__c', 'Staging_Type__c', 'Source__c',
  'Involvement_External_Id__c', 'Contact_External_Id__c', 'Event_External_Id__c',
  'First_Name__c', 'Last_Name__c', 'Email_Address__c', 'Local_Phone_Number__c', 'Title__c',
  'Mailing_Street__c', 'Mailing_Address_Line_2__c', 'Mailing_City__c', 'Mailing_State__c', 'Mailing_Postal_Code__c',
  'Involvement_Status__c', 'Involvement_Registration_Type__c', 'Registrant_Type__c',
  'Date_Registered__c', 'Date_Cancelled__c', 'Date_Check_In__c',
  'ERT_Last_Updated__c', 'Involvement_Registration_Created_Date__c',
  'Event_Id__c', 'Event_Name__c', 'Event_Location__c',
  'Event_Start_Date__c', 'Event_End_Date__c',
  'Event_Sponsor_Staff_Name__c', 'Event_Sponsor_Staff_Email__c', 'Event_Type__c',
  'Paid_Amount__c', 'Payment_Type__c', 'Promo_Code__c',
  'GiftCardId__c', 'GiftCardValue__c', 'GiftCardAssociatedProduct__c', 'GiftCardGlCode__c',
  'Group_Name__c', 'Branch_of_Service__c', 'Military_Location__c',
  'Church_Affiliation__c', 'Church_Attendance__c', 'Church_Name__c',
  'Church_Phone__c', 'Church_Position__c', 'Church_Website__c',
  'Previous_WTR_Attendee__c', 'Referral__c', 'FL_Involvement__c',
  'Church_Street__c', 'Church_Street_2__c', 'Church_City__c',
  'Church_State__c', 'Church_Postal_Code__c', 'Church_Country__c',
  'SMS_Opt_In__c', 'SMS_Keyword__c',
  'Email_Subscription_Signup__c', 'Email_Subscription_List__c',
  'Waiver__c',
]

const sfFieldMap = new Map()
for (const f of describe.fields) {
  sfFieldMap.set(f.name.toLowerCase(), f)
}

const matched = []
const missing = []
const typeIssues = []

for (const fieldName of OUR_FIELDS) {
  const sfField = sfFieldMap.get(fieldName.toLowerCase())
  if (!sfField) {
    missing.push(fieldName)
  } else {
    matched.push({ ours: fieldName, sf: sfField.name, type: sfField.type, createable: sfField.createable, nillable: sfField.nillable, length: sfField.length })
  }
}

console.log(`  Matched: ${matched.length}/${OUR_FIELDS.length}`)
if (missing.length > 0) {
  console.log(`  MISSING fields (${missing.length}):`)
  for (const f of missing) console.log(`    - ${f}`)
}

// Show field type details
console.log('\n  Field details:')
for (const f of matched) {
  const notes = []
  if (!f.createable) notes.push('NOT CREATEABLE')
  if (!f.nillable) notes.push('required')
  if (f.length) notes.push(`len=${f.length}`)
  console.log(`    ${f.sf}: ${f.type}${notes.length ? ` (${notes.join(', ')})` : ''}`)
}

// Check for extra custom fields on the object we might be missing
const sfCustomFields = describe.fields
  .filter(f => f.name.endsWith('__c') && !OUR_FIELDS.map(n => n.toLowerCase()).includes(f.name.toLowerCase()))
  .map(f => ({ name: f.name, type: f.type, label: f.label }))

if (sfCustomFields.length > 0) {
  console.log(`\n  Extra custom fields on SF object we DON'T map (${sfCustomFields.length}):`)
  for (const f of sfCustomFields) {
    console.log(`    ${f.name}: ${f.type} ("${f.label}")`)
  }
}

// --- Step 4: Test insert + cleanup ---
console.log('\n=== Step 4: Test insert ===')

const testRecord = {
  Status__c: 'Ready to Process',
  Staging_Type__c: 'Registration',
  Source__c: 'ERT',
  Involvement_External_Id__c: 'ERTREG-POC-TEST-DELETE-ME',
  Contact_External_Id__c: 'ERTPER-POC-TEST-DELETE-ME',
  Event_External_Id__c: 'ERTCON-POC-TEST-DELETE-ME',
  First_Name__c: 'POC',
  Last_Name__c: 'Test',
  Email_Address__c: 'poc-test@example.com',
  Involvement_Status__c: 'Registered',
  Registrant_Type__c: 'Couple',
  Event_Id__c: 'POC-TEST',
  Event_Name__c: 'PoC Test Conference',
}

let insertedId = null
try {
  const insertRes = await fetch(`${apiBase}/sobjects/Staging_Involvement_Object__c`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testRecord),
  })

  const insertBody = await insertRes.json()

  if (insertRes.ok && insertBody.success) {
    insertedId = insertBody.id
    console.log(`  Insert SUCCESS: id=${insertedId}`)
  } else {
    console.log(`  Insert FAILED (${insertRes.status}):`)
    console.log(`  ${JSON.stringify(insertBody, null, 2)}`)
  }
} catch (err) {
  console.error(`  Insert error: ${err.message}`)
}

// Clean up - delete the test record
if (insertedId) {
  console.log('\n=== Step 5: Cleanup (delete test record) ===')
  try {
    const delRes = await fetch(`${apiBase}/sobjects/Staging_Involvement_Object__c/${insertedId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (delRes.ok || delRes.status === 204) {
      console.log(`  Deleted ${insertedId} successfully`)
    } else {
      const delBody = await delRes.text()
      console.log(`  Delete failed (${delRes.status}): ${delBody}`)
      console.log(`  MANUAL CLEANUP NEEDED: delete Staging_Involvement_Object__c id=${insertedId}`)
    }
  } catch (err) {
    console.error(`  Delete error: ${err.message}`)
    console.log(`  MANUAL CLEANUP NEEDED: delete Staging_Involvement_Object__c id=${insertedId}`)
  }
}

console.log('\n=== PoC Complete ===')
