import { createErtService } from '../src/services/ert.js'
import { createSalesforceService } from '../src/services/salesforce.js'
import { runRegistrationsToSF } from '../src/core/orchestrator.js'

const lastImportDate = process.argv[2]

if (!lastImportDate) {
  console.error('Usage: npx tsx scripts/run-from-date.ts <ISO-8601-date>')
  console.error('Example: npx tsx scripts/run-from-date.ts 2026-03-11T20:00:00Z')
  process.exit(1)
}

async function main() {
  console.error(`Using lastImportDate: ${lastImportDate}`)

  const services = {
    ert: createErtService(),
    salesforce: createSalesforceService(),
    ssm: {
      getLastImportDate: async () => lastImportDate,
      updateLastImportDate: async (value: string) => {
        console.error(`[stub] Would update SSM lastImportDate to: ${value}`)
      },
    },
  }

  const result = await runRegistrationsToSF(services)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
