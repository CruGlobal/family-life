import { ErtService } from '../src/services/ert.js'
import { transformRegistrant } from '../src/core/registration-transformer.js'
import type { BlockLookups } from '../src/core/answer-processor.js'
import type { ERTConferenceDetail } from '../src/types/ert.js'

async function main() {
  const ert = new ErtService()
  const LINCOLN_ID = 'cbf8d4c4-baf9-48fc-85ce-b5bfe3374e7c'
  const FILTER_AFTER = '2026-01-28T00:00:00Z'
  const TARGET_REGISTRANT = '463b12fd-cff4-4f7f-b1c4-f1ddc196b2c2'

  const detail: ERTConferenceDetail = await ert.getConferenceDetail(LINCOLN_ID)

  const titleLookup: Record<string, string> = {}
  const profileTypeLookup: Record<string, string | null> = {}
  const tagNameLookup: Record<string, string> = {}
  for (const page of detail.registrationPages || []) {
    for (const block of page.blocks || []) {
      titleLookup[block.id] = block.title
      profileTypeLookup[block.id] = block.profileType
      if (block.blockTagType?.name) tagNameLookup[block.id] = block.blockTagType.name
    }
  }
  const lookups: BlockLookups = { titleLookup, profileTypeLookup, tagNameLookup }

  console.error('Registration pages:', detail.registrationPages?.length || 0)
  for (const page of detail.registrationPages || []) {
    console.error(`  Page ${page.id}: ${page.blocks?.length || 0} blocks`)
  }
  console.error('Tag blocks found:', Object.keys(tagNameLookup).length)
  console.error('Tag names:', JSON.stringify(Object.values(tagNameLookup), null, 2))

  const regTypeNameLookup: Record<string, string> = {}
  for (const rt of detail.registrantTypes || []) {
    regTypeNameLookup[rt.id] = rt.name
  }

  const registrations = await ert.getAllRegistrations(LINCOLN_ID, FILTER_AFTER)
  console.error('Registrations found:', registrations.length)

  // Dump target registrant answers
  for (const reg of registrations) {
    for (const registrant of reg.registrants || []) {
      if (registrant.id === TARGET_REGISTRANT) {
        console.error('\nTarget registrant answers:', registrant.answers.length)
        for (const a of registrant.answers) {
          const tag = tagNameLookup[a.blockId]
          const profile = profileTypeLookup[a.blockId]
          console.error(`  block=${a.blockId} tag=${tag || '-'} profile=${profile || '-'} value=${JSON.stringify(a.value)}`)
        }
      }
    }
  }

  // Output transformed records for the target registrant AND the primary registrant from the same registration
  const context = { conference: detail, lookups, regTypeNameLookup }
  for (const reg of registrations) {
    const hasTarget = reg.registrants?.some(r => r.id === TARGET_REGISTRANT)
    if (!hasTarget) continue

    console.error('\nRegistration:', reg.id, 'primary:', reg.primaryRegistrantId)
    for (const registrant of reg.registrants || []) {
      const label = registrant.id === TARGET_REGISTRANT ? 'TARGET' : 'PRIMARY'
      console.error(`\n--- ${label} (${registrant.id}) type=${regTypeNameLookup[registrant.registrantTypeId]} answers=${registrant.answers.length}`)
      const record = transformRegistrant(reg, registrant, context)
      console.log(JSON.stringify({ _label: label, ...record }, null, 2))
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
