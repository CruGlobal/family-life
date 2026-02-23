import { createErtService } from './ert.js'
import { createSalesforceService } from './salesforce.js'
import { createSsmService } from './ssm.js'

export { ErtService, createErtService } from './ert.js'
export { SalesforceService, createSalesforceService } from './salesforce.js'
export { SsmService, createSsmService } from './ssm.js'

export function createServices() {
  return {
    ert: createErtService(),
    salesforce: createSalesforceService(),
    ssm: createSsmService(),
  }
}

export type Services = ReturnType<typeof createServices>
