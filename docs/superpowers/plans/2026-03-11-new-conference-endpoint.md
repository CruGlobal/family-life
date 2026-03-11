# New Conference Endpoint Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken conference discovery flow with Ben deVries' new `/integrations/conferences` endpoint that returns pre-filtered FamilyLife WTR conference IDs.

**Architecture:** The new endpoint eliminates the need for ministry lookup, conference list, and per-conference activity verification. The orchestrator will call one endpoint to get conference IDs, fetch details for each, then process registrations as before. Config switches from name-based ministry/activity lookup to UUID-based.

**Tech Stack:** TypeScript, Vitest, esbuild, AWS Lambda

**Spec:** `docs/superpowers/specs/2026-03-11-new-conference-endpoint-design.md`

---

## Chunk 1: Config and ERT Service Changes

### Task 1: Update Config — Replace Name-Based with ID-Based Config

**Files:**
- Modify: `src/config/index.ts:1-69`
- Modify: `tests/unit/config/index.test.ts:1-123`
- Modify: `.env.test:1-12`

- [ ] **Step 1: Update `.env.test` — replace name vars with ID vars**

Replace `ERT_MINISTRY_NAME` and `ERT_ACTIVITY_NAME` with:

```
ERT_MINISTRY_ID=9f63db46-6ca9-43b0-868a-23326b3c4d91
ERT_ACTIVITY_ID=9c6eae3f-8928-4703-a2a4-e5bf995dfd19
```

- [ ] **Step 2: Update the `Config` interface and `getConfig()` in `src/config/index.ts`**

In the `Config` interface, replace:
```typescript
ertMinistryName: string
ertActivityName: string
```
with:
```typescript
ertMinistryId: string
ertActivityId: string
```

In `getConfig()`, replace:
```typescript
ertMinistryName: process.env.ERT_MINISTRY_NAME || 'Family Life',
ertActivityName: process.env.ERT_ACTIVITY_NAME || 'WTR',
```
with:
```typescript
ertMinistryId: process.env.ERT_MINISTRY_ID || '9f63db46-6ca9-43b0-868a-23326b3c4d91',
ertActivityId: process.env.ERT_ACTIVITY_ID || '9c6eae3f-8928-4703-a2a4-e5bf995dfd19',
```

- [ ] **Step 3: Update config test — change default value assertions**

In `tests/unit/config/index.test.ts`, in the `'uses default values for optional fields'` test (line 36), replace:
```typescript
expect(config.ertMinistryName).toBe('Family Life')
expect(config.ertActivityName).toBe('WTR')
```
with:
```typescript
expect(config.ertMinistryId).toBe('9f63db46-6ca9-43b0-868a-23326b3c4d91')
expect(config.ertActivityId).toBe('9c6eae3f-8928-4703-a2a4-e5bf995dfd19')
```

- [ ] **Step 4: Run config tests**

Run: `npx vitest run tests/unit/config/index.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/index.ts tests/unit/config/index.test.ts .env.test
git commit -m "Replace ERT_MINISTRY_NAME/ERT_ACTIVITY_NAME with UUID-based config"
```

---

### Task 2: Update ERT Service — Add `getConferenceIds`, Remove Old Methods

**Files:**
- Modify: `src/services/ert.ts:1-121`
- Modify: `tests/unit/services/ert.test.ts:1-147`

- [ ] **Step 1: Write the failing test for `getConferenceIds`**

In `tests/unit/services/ert.test.ts`, add this test after the existing tests (before the closing `})`):

```typescript
it('getConferenceIds calls integrations endpoint with ministry and activity params', async () => {
  const mockIds = ['conf-1', 'conf-2', 'conf-3']
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockIds),
  })

  const svc = new ErtService()
  const result = await svc.getConferenceIds('m-1', 'a-1')

  expect(result).toEqual(mockIds)
  const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
  expect(calledUrl).toContain('/integrations/conferences')
  expect(calledUrl).toContain('ministries=m-1')
  expect(calledUrl).toContain('ministryActivities=a-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/ert.test.ts`
Expected: FAIL — `svc.getConferenceIds is not a function`

- [ ] **Step 3: Add `getConferenceIds` method to `ErtService`**

In `src/services/ert.ts`, add this method to the `ErtService` class (after the `getConferenceDetail` method, before `getRegistrations`):

```typescript
async getConferenceIds(ministryId: string, activityId: string): Promise<string[]> {
  return this.request<string[]>('/integrations/conferences', {
    ministries: ministryId,
    ministryActivities: activityId,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/services/ert.test.ts`
Expected: All tests pass (including the new one).

- [ ] **Step 5: Remove `getMinistries` and `getConferences` methods from `ErtService`**

In `src/services/ert.ts`:

1. Remove the `getMinistries` method (lines 56-58):
```typescript
async getMinistries(): Promise<ERTMinistry[]> {
  return this.request<ERTMinistry[]>('/ministries')
}
```

2. Remove the `getConferences` method (lines 60-66):
```typescript
async getConferences(ministryId: string, eventTypeId?: string): Promise<ERTConferenceSummary[]> {
  const params: Record<string, string> = { ministries: ministryId }
  if (eventTypeId) {
    params.eventTypes = eventTypeId
  }
  return this.request<ERTConferenceSummary[]>('/conferences', params)
}
```

3. Remove the now-unused type imports from the top of the file. Replace:
```typescript
import type {
  ERTMinistry,
  ERTConferenceSummary,
  ERTConferenceDetail,
  ERTRegistration,
  ERTPaginatedResponse,
} from '../types/ert.js'
```
with:
```typescript
import type {
  ERTConferenceDetail,
  ERTRegistration,
  ERTPaginatedResponse,
} from '../types/ert.js'
```

- [ ] **Step 6: Remove old ERT service tests**

In `tests/unit/services/ert.test.ts`, remove these three test cases:

1. `'getMinistries calls correct endpoint with auth header'` (lines 23-43)
2. `'getConferences passes ministry and eventType params'` (lines 45-58)
3. `'getConferences omits eventTypes when not provided'` (lines 60-72)

Also update the `'throws on non-OK response'` test (line 136-145) — it currently calls `svc.getMinistries()`. Change it to call a method that still exists:

```typescript
it('throws on non-OK response', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: () => Promise.resolve('Internal Server Error'),
  })

  const svc = new ErtService()
  await expect(svc.getConferenceIds('m-1', 'a-1')).rejects.toThrow('ERT API error 500')
})
```

- [ ] **Step 7: Run ERT service tests**

Run: `npx vitest run tests/unit/services/ert.test.ts`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/services/ert.ts tests/unit/services/ert.test.ts
git commit -m "Add getConferenceIds, remove getMinistries and getConferences"
```

---

## Chunk 2: Orchestrator and Cleanup

### Task 3: Rewrite Orchestrator — Use New Endpoint

**Files:**
- Modify: `src/core/orchestrator.ts:1-140`
- Modify: `tests/unit/core/orchestrator.test.ts:1-323`

- [ ] **Step 1: Update the `makeServices` helper in the orchestrator test**

In `tests/unit/core/orchestrator.test.ts`, replace the `makeServices` function (lines 40-122) with:

```typescript
function makeServices(overrides: Partial<{
  conferenceIds: string[]
  conferenceDetails: Record<string, unknown>
  registrations: unknown[]
  insertResult: { successCount: number; errorCount: number; errors: never[] }
  lastImportDate: string
}> = {}): Services {
  const conferenceIds = overrides.conferenceIds ?? ['c-1']
  const detailMap = overrides.conferenceDetails ?? { 'c-1': defaultDetail }
  const registrations = overrides.registrations ?? [
    {
      id: 'r-1',
      conferenceId: 'c-1',
      primaryRegistrantId: 'rg-1',
      completed: true,
      completedTimestamp: '2026-02-01T10:00:00Z',
      lastUpdatedTimestamp: '2026-02-01T10:00:00Z',
      totalPaid: 199,
      remainingBalance: 0,
      pastPayments: [],
      promotions: [],
      registrants: [
        {
          id: 'rg-1',
          registrantTypeId: 'rt-1',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          withdrawn: false,
          withdrawnTimestamp: null,
          checkedInTimestamp: null,
          eformStatus: null,
          answers: [],
        },
      ],
    },
  ]

  return {
    ert: {
      getConferenceIds: vi.fn().mockResolvedValue(conferenceIds),
      getConferenceDetail: vi.fn().mockImplementation((id: string) => {
        const detail = detailMap[id]
        return detail ? Promise.resolve(detail) : Promise.reject(new Error(`Not found: ${id}`))
      }),
      getRegistrations: vi.fn(),
      getAllRegistrations: vi.fn().mockResolvedValue(registrations),
    },
    salesforce: {
      getConnection: vi.fn(),
      insertStagingRecords: vi.fn().mockResolvedValue(
        overrides.insertResult ?? { successCount: 1, errorCount: 0, errors: [] }
      ),
    },
    ssm: {
      getLastImportDate: vi.fn().mockResolvedValue(
        overrides.lastImportDate ?? '2026-02-01T00:00:00Z'
      ),
      updateLastImportDate: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Services
}
```

- [ ] **Step 2: Update `beforeEach` env vars**

In `tests/unit/core/orchestrator.test.ts`, in the `beforeEach` block (lines 7-17), replace:
```typescript
process.env.ERT_MINISTRY_NAME = 'Family Life'
process.env.ERT_ACTIVITY_NAME = 'WTR'
```
with:
```typescript
process.env.ERT_MINISTRY_ID = '9f63db46-6ca9-43b0-868a-23326b3c4d91'
process.env.ERT_ACTIVITY_ID = '9c6eae3f-8928-4703-a2a4-e5bf995dfd19'
```

- [ ] **Step 3: Delete test cases for removed code paths**

Remove these four test cases from `tests/unit/core/orchestrator.test.ts`:

1. `'throws when ministry not found'` (lines 136-142)
2. `'throws when ministry has no activities'` (lines 144-150)
3. `'throws when WTR activity not found'` (lines 152-160)
4. `'filters out archived conferences'` (lines 162-189)

- [ ] **Step 4: Update the "filters out non-WTR conferences via detail lookup" test**

This test (lines 191-217) tested the old ministry-activity verification via detail fetch. Since the new endpoint pre-filters, this test is no longer relevant. Remove it.

- [ ] **Step 5: Update remaining test cases that use old `makeServices` params**

The `'aborts entire run when any conference gather fails'` test (lines 219-267) uses `conferences` and `conferenceDetails` params. Update it to use `conferenceIds` instead of `conferences`:

```typescript
it('aborts entire run when any conference gather fails', async () => {
  const goodDetail = { ...defaultDetail, id: 'c-1', name: 'Good conf' }
  const badDetail = { ...defaultDetail, id: 'c-2', name: 'Bad conf' }

  const services = makeServices({
    conferenceIds: ['c-1', 'c-2'],
    conferenceDetails: {
      'c-1': goodDetail,
      'c-2': badDetail,
    },
  })

  // getAllRegistrations succeeds for c-1, fails for c-2
  let regCallCount = 0
  ;(services.ert.getAllRegistrations as ReturnType<typeof vi.fn>).mockImplementation(() => {
    regCallCount++
    if (regCallCount === 2) {
      return Promise.reject(new Error('API timeout'))
    }
    return Promise.resolve([{
      id: 'r-1',
      conferenceId: 'c-1',
      primaryRegistrantId: 'rg-1',
      completed: true,
      registrants: [{
        id: 'rg-1',
        registrantTypeId: 'rt-1',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
        withdrawn: false,
        withdrawnTimestamp: null,
        checkedInTimestamp: null,
        eformStatus: null,
        answers: [],
      }],
    }])
  })

  await expect(runRegistrationsToSF(services)).rejects.toThrow('Gather failed for 1 conference(s)')
  expect(services.salesforce.insertStagingRecords).not.toHaveBeenCalled()
  expect(services.ssm.updateLastImportDate).not.toHaveBeenCalled()
})
```

The `'combines records from multiple conferences into one insert call'` test (lines 279-300) also needs updating. Replace:

```typescript
it('combines records from multiple conferences into one insert call', async () => {
  const detail1 = { ...defaultDetail, id: 'c-1', name: 'WTR Lincoln' }
  const detail2 = { ...defaultDetail, id: 'c-2', name: 'WTR Denver' }

  const services = makeServices({
    conferenceIds: ['c-1', 'c-2'],
    conferenceDetails: { 'c-1': detail1, 'c-2': detail2 },
    insertResult: { successCount: 2, errorCount: 0, errors: [] as never[] },
  })

  const result = await runRegistrationsToSF(services)

  expect(services.salesforce.insertStagingRecords).toHaveBeenCalledTimes(1)
  const insertedRecords = (services.salesforce.insertStagingRecords as ReturnType<typeof vi.fn>).mock.calls[0][0]
  expect(insertedRecords).toHaveLength(2)
  expect(result.totalRecords).toBe(2)
  expect(result.conferencesProcessed).toBe(2)
})
```

- [ ] **Step 6: Run orchestrator tests to confirm they fail (old orchestrator code)**

Run: `npx vitest run tests/unit/core/orchestrator.test.ts`
Expected: FAIL — tests reference `getConferenceIds` which doesn't exist on the mock, and the orchestrator still calls `getMinistries`/`getConferences`.

- [ ] **Step 7: Rewrite the orchestrator**

Replace the entire content of `src/core/orchestrator.ts` with:

```typescript
import type { Services } from '../services/index.js'
import type { ERTConferenceDetail } from '../types/ert.js'
import type { InsertResult } from '../types/salesforce.js'
import type { ConferenceResult } from './conference-processor.js'
import { processConference } from './conference-processor.js'
import { logger } from '../utils/logging.js'
import { getConfig } from '../config/index.js'

export interface RegistrationsToSFResult {
  runStartTime: string
  lastImportDate: string
  conferencesFound: number
  conferencesProcessed: number
  totalRecords: number
  conferenceResults: ConferenceResult[]
  insertResult: InsertResult
}

export async function runRegistrationsToSF(services: Services): Promise<RegistrationsToSFResult> {
  const runStartTime = new Date().toISOString()
  const config = getConfig()

  // 1. Read lastImportDate from SSM
  const lastImportDate = await services.ssm.getLastImportDate()
  logger.info('Starting sync', { lastImportDate, runStartTime })

  // 2. Get pre-filtered WTR conference IDs from ERT
  const conferenceIds = await services.ert.getConferenceIds(
    config.ertMinistryId,
    config.ertActivityId
  )

  logger.info('Fetched WTR conference IDs', { count: conferenceIds.length })

  // 3. Fetch full details for each conference
  const detailResults = await Promise.allSettled(
    conferenceIds.map(id => services.ert.getConferenceDetail(id))
  )

  const details: ERTConferenceDetail[] = detailResults
    .filter((r): r is PromiseFulfilledResult<ERTConferenceDetail> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value)

  if (details.length < conferenceIds.length) {
    const failedCount = conferenceIds.length - details.length
    logger.warn('Some conference details failed to fetch', {
      requested: conferenceIds.length,
      fetched: details.length,
      failed: failedCount,
    })
  }

  // 4. Gather records from all conferences (parallel, but any failure aborts the run)
  const gatherResults = await Promise.allSettled(
    details.map(detail =>
      processConference(detail, lastImportDate, services)
    )
  )

  const conferenceResults: ConferenceResult[] = []
  const gatherErrors: Array<{ conferenceId: string; error: string }> = []

  gatherResults.forEach((result, index) => {
    const detail = details[index]
    if (result.status === 'fulfilled') {
      conferenceResults.push(result.value)
    } else {
      const errMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
      gatherErrors.push({ conferenceId: detail.id, error: errMsg })
      logger.error('Conference gather failed', result.reason, {
        conferenceId: detail.id,
        conferenceName: detail.name,
      })
    }
  })

  // If any conference gather failed, abort — don't insert, don't advance cursor
  if (gatherErrors.length > 0) {
    const summary = gatherErrors.map(e => `${e.conferenceId}: ${e.error}`).join('; ')
    throw new Error(`Gather failed for ${gatherErrors.length} conference(s): ${summary}`)
  }

  // 5. Collect all records and do one atomic insert
  const allRecords = conferenceResults.flatMap(r => r.records)

  logger.info('Inserting all records atomically', {
    totalRecords: allRecords.length,
    conferences: conferenceResults.length,
  })

  const insertResult = await services.salesforce.insertStagingRecords(allRecords)

  // 6. Update lastImportDate only after successful insert
  await services.ssm.updateLastImportDate(runStartTime)

  const syncResult: RegistrationsToSFResult = {
    runStartTime,
    lastImportDate,
    conferencesFound: details.length,
    conferencesProcessed: conferenceResults.length,
    totalRecords: allRecords.length,
    conferenceResults,
    insertResult,
  }

  logger.info('Sync complete', {
    conferencesFound: syncResult.conferencesFound,
    conferencesProcessed: syncResult.conferencesProcessed,
    totalRecords: syncResult.totalRecords,
    insertSuccess: insertResult.successCount,
  })

  return syncResult
}
```

- [ ] **Step 8: Run orchestrator tests**

Run: `npx vitest run tests/unit/core/orchestrator.test.ts`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/orchestrator.ts tests/unit/core/orchestrator.test.ts
git commit -m "Rewrite orchestrator to use pre-filtered conference endpoint"
```

---

### Task 4: Remove Dead Types and Fixtures

**Files:**
- Modify: `src/types/ert.ts:1-35`
- Modify: `tests/fixtures/conferences.ts:1,5-18`

- [ ] **Step 1: Remove dead types from `src/types/ert.ts`**

Remove these four interfaces (lines 1-35):

```typescript
export interface ERTMinistry {
  id: string
  name: string
  activities: ERTMinistryActivity[]
  eventTypes?: ERTEventType[]
}

export interface ERTMinistryActivity {
  id: string
  name: string
}

export interface ERTEventType {
  id: string
  name: string
}
```

And also remove `ERTConferenceSummary` (lines 25-35):

```typescript
export interface ERTConferenceSummary {
  id: string
  name: string
  abbreviation: string | null
  archived: boolean
  ministry: string | null
  ministryActivity: string | null
  eventType: string | null
  eventStartTime: string
  eventEndTime: string
}
```

- [ ] **Step 2: Remove `makeConferenceSummary` and its import from `tests/fixtures/conferences.ts`**

Update the import on line 1 — remove `ERTConferenceSummary`:
```typescript
import type { ERTConferenceDetail, ERTRegistrationPage, ERTRegistrantType } from '../../src/types/ert.js'
```

Remove the `makeConferenceSummary` function (lines 5-18) and the `WTR_ACTIVITY_ID` constant (line 3) and its export (line 133) — but only if `WTR_ACTIVITY_ID` is not used by `makeConferenceDetail`. Check: it IS used by `makeConferenceDetail` (line 27: `ministryActivity: WTR_ACTIVITY_ID`), so keep it but remove the named export since no test imports it directly.

Updated top of file:
```typescript
import type { ERTConferenceDetail, ERTRegistrationPage, ERTRegistrantType } from '../../src/types/ert.js'

const WTR_ACTIVITY_ID = 'activity-wtr-001'

export function makeConferenceDetail(overrides: Partial<ERTConferenceDetail> = {}): ERTConferenceDetail {
```

Remove the final line `export { WTR_ACTIVITY_ID }` — check first if anything imports it.

- [ ] **Step 3: Check if `WTR_ACTIVITY_ID` is imported anywhere**

Run: `npx vitest run tests/unit/core/orchestrator.test.ts` — if it imported `WTR_ACTIVITY_ID`, this would fail. Based on code review, no test imports it.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/ert.ts tests/fixtures/conferences.ts
git commit -m "Remove dead types and unused fixture factory"
```

---

### Task 5: Update CLAUDE.md and Run Final Verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md fixture factory reference**

In `CLAUDE.md`, the line referencing fixture factories mentions `makeConferenceSummary()`. Update to remove it:

Replace:
```
- Fixture factories (all accept partial overrides): `makeRegistration()`, `makeRegistrant()`, `makeAnswer()` in `registrations.ts`; `makeConferenceSummary()`, `makeConferenceDetail()` in `conferences.ts`; `makeBlockLookups()` in `blocks.ts`.
```
with:
```
- Fixture factories (all accept partial overrides): `makeRegistration()`, `makeRegistrant()`, `makeAnswer()` in `registrations.ts`; `makeConferenceDetail()` in `conferences.ts`; `makeBlockLookups()` in `blocks.ts`.
```

- [ ] **Step 2: Run full test suite with coverage**

Run: `npm test`
Expected: All tests pass, no regressions.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md to reflect removed fixture factory"
```
