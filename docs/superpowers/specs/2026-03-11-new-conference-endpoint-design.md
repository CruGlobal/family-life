# Use Ben's Pre-Filtered Conference Endpoint

**Date:** 2026-03-11
**Status:** Approved

## Problem

The production lambda fails because `GET /conferences?ministries={id}&eventTypes={id}` returns too many results, causing ERT to respond with 500 Internal Server Error. The current flow also requires multiple unnecessary API calls: a ministry lookup to find IDs by name, a conference list call, and per-conference detail fetches solely to verify ministry activity.

## Solution

Ben deVries (ERT Tech Lead) created a new endpoint that returns conference IDs pre-filtered to FamilyLife WTR conferences:

```
GET /integrations/conferences?ministries={ministryId}&ministryActivities={activityId}
```

Response: `string[]` (array of conference ID UUIDs)

The ministry ID and activity ID for FamilyLife WTR are known constants:
- Ministry: `9f63db46-6ca9-43b0-868a-23326b3c4d91`
- Ministry Activity: `9c6eae3f-8928-4703-a2a4-e5bf995dfd19`

## Changes

### 1. Config (`src/config/index.ts`)

- Remove `ERT_MINISTRY_NAME` and `ERT_ACTIVITY_NAME` (string-match config)
- Add `ERT_MINISTRY_ID` and `ERT_ACTIVITY_ID` (UUID config with defaults matching FamilyLife WTR)
- Update `Config` interface and `getConfig()` accordingly

### 2. ERT Service (`src/services/ert.ts`)

- Add `getConferenceIds(ministryId: string, activityId: string): Promise<string[]>`
  - Calls `GET /integrations/conferences?ministries={ministryId}&ministryActivities={activityId}`
  - Returns `string[]`
- Remove `getMinistries()` — no longer needed
- Remove `getConferences()` — replaced by `getConferenceIds()`

### 3. Orchestrator (`src/core/orchestrator.ts`)

Replace steps 2-3 (ministry lookup, conference list, detail verification) with:

1. Call `services.ert.getConferenceIds(config.ertMinistryId, config.ertActivityId)` to get ID list
2. Fetch `getConferenceDetail()` for each ID (still needed for form structure, location, registrant types)
3. Process each detail with `processConference()` (unchanged)

The `WTR_EVENT_TYPE_ID` constant and all ministry/activity name-matching logic are removed. The archived-conference filter is also removed since the new endpoint handles filtering.

### 4. Types (`src/types/ert.ts`)

Remove types that are no longer referenced:
- `ERTMinistry`
- `ERTMinistryActivity`
- `ERTConferenceSummary`

Keep: `ERTConferenceDetail`, `ERTEventType`, `ERTBlock`, `ERTRegistration`, `ERTRegistrant`, `ERTAnswer`, `ERTPaginatedResponse`, and all other types used by conference processing.

### 5. Tests

- Update orchestrator tests to mock the new `getConferenceIds()` method instead of `getMinistries()` + `getConferences()`
- Update ERT service tests: remove tests for `getMinistries()` and `getConferences()`, add test for `getConferenceIds()`
- Update config tests for new env vars
- Remove conference fixture factories only if no longer used (check first)
- `makeConferenceSummary()` fixture can be removed if unused after changes

### 6. Environment / Deployment

- Add `ERT_MINISTRY_ID` and `ERT_ACTIVITY_ID` to `.env.test` (with the known UUIDs)
- Update Terraform/SSM config for staging and production (or rely on defaults if hardcoded)
- Remove `ERT_MINISTRY_NAME` and `ERT_ACTIVITY_NAME` from all environments

## What Does NOT Change

- `getConferenceDetail()` — still needed for form structure, location data, registrant types
- `processConference()` — receives `ERTConferenceDetail`, unchanged
- `registration-transformer.ts` — unchanged
- `answer-processor.ts` — unchanged
- `field-mapping.ts` — unchanged
- Salesforce service — unchanged
- SSM service — unchanged
- All downstream business logic (status calculation, type mapping, answer parsing, SF insert)

## Verification

- In production, the new endpoint should return ~1 conference ID
- Existing unit tests (updated for new mocks) validate the processing pipeline
- A dry run against staging can confirm the endpoint returns expected IDs
