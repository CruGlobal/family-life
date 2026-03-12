export interface Config {
  environment: string

  // ERT
  ertBaseUrl: string
  ertApiKey: string
  ertMinistryId: string
  ertActivityId: string

  // Salesforce
  sfLoginUrl: string
  sfClientId: string
  sfClientSecret: string

  // SSM
  ssmLastImportDateParam: string

  // Tuning
  registrationPageSize: number
  sfBatchSize: number
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name]
  if (!value) return defaultValue
  const num = parseInt(value, 10)
  if (isNaN(num)) return defaultValue
  return num
}

let cachedConfig: Config | null = null

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig

  cachedConfig = {
    environment: process.env.ENVIRONMENT || 'sandbox',

    ertBaseUrl: requireEnv('ERT_BASE_URL'),
    ertApiKey: requireEnv('ERT_API_KEY'),
    ertMinistryId: process.env.ERT_MINISTRY_ID || '9f63db46-6ca9-43b0-868a-23326b3c4d91',
    ertActivityId: process.env.ERT_ACTIVITY_ID || '9c6eae3f-8928-4703-a2a4-e5bf995dfd19',

    sfLoginUrl: requireEnv('SF_LOGIN_URL'),
    sfClientId: requireEnv('SF_CLIENT_ID'),
    sfClientSecret: requireEnv('SF_CLIENT_SECRET'),

    ssmLastImportDateParam: requireEnv('SSM_LAST_IMPORT_DATE_PARAM'),

    registrationPageSize: getEnvNumber('REGISTRATION_PAGE_SIZE', 100),
    sfBatchSize: getEnvNumber('SF_BATCH_SIZE', 200)
  }

  return cachedConfig
}

export function resetConfig(): void {
  cachedConfig = null
}

export { default as rollbar } from './rollbar.js'
