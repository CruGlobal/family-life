import { createErtService } from '../src/services/ert.js'
import { createSalesforceService } from '../src/services/salesforce.js'
import { runRegistrationsToSF } from '../src/core/orchestrator.js'

const LAST_IMPORT_DATE = '2026-02-25T00:00:00Z'

async function main() {
  const services = {
    ert: createErtService(),
    salesforce: createSalesforceService(),
    ssm: {
      getLastImportDate: async () => LAST_IMPORT_DATE,
      updateLastImportDate: async (value: string) => {
        console.error(`[stub] Would update SSM lastImportDate to: ${value}`)
      },
    },
  }

  const result = await runRegistrationsToSF(services)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
