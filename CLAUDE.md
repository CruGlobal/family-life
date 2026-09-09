# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
npm test                                          # Run tests with coverage
npm run test:watch                                # Watch mode (re-runs on change)
npx vitest run tests/unit/core/answer-processor   # Run a single test file (partial path match)
npm run typecheck                                 # TypeScript checking
npm run lint                                      # ESLint
npm run lint:fix                                  # ESLint with auto-fix
npm run build                                     # Bundle to dist/handler.js via esbuild
```

## What This Does

Syncs WTR (Weekend to Remember) event registrations from ERT (Event Registration Tool) to Salesforce `Staging_Involvement__c`. Runs every 15 minutes via EventBridge.

## Architecture

**Data flow:** ERT REST API → filter/transform → insert into SF staging object

- `src/index.ts` — Named exports of handlers for Datadog wrapper (e.g., `registrationsToSF`)
- `src/handlers/registrations-to-sf.ts` — EventBridge entry point, creates services, runs registrationsToSF, reports errors to Rollbar
- `src/core/orchestrator.ts` — Main registrationsToSF flow: read SSM cursor → find ministry/activity → fetch conferences → process each → update cursor
- `src/core/conference-processor.ts` — Per-conference: fetch detail, build block lookups, fetch registrations (paginated), transform each registrant, bulk insert to SF
- `src/core/registration-transformer.ts` — Maps an ERT registrant to a `StagingInvolvementRecord`
- `src/core/answer-processor.ts` — Extracts contact/tag fields from block answers using `profileType` and `blockTagType`
- `src/core/field-mapping.ts` — Constants: `TAG_TO_SF_FIELD` map, `CHURCH_ADDRESS_FIELD_MAP`, `EVENT_TYPE_MAP`, status/type helper functions

**Services** (`src/services/`):
- `ErtService` — fetch-based REST client, API key auth, handles pagination
- `SalesforceService` — jsforce v3, OAuth 2.0 client_credentials flow, batched inserts
- `SsmService` — AWS SSM Parameter Store for `lastImportDate` cursor

Services are created via `createServices()` which returns a `Services` type used for dependency injection throughout the sync flow.

**Types** (`src/types/`): `ert.ts` defines all ERT API shapes (ministries, conferences, registrations, answers, pagination). `salesforce.ts` defines `StagingInvolvementRecord` and `InsertResult`.

**Utilities** (`src/utils/`): `logging.ts` provides a structured JSON `logger` with debug/info/warn/error levels (controlled by `LOG_LEVEL` env var). `html.ts` has HTML escaping.

## Key Business Rules

- **Insert-only** to SF staging object (no upsert). SF consumes and removes records after processing.
- **Conference isolation**: `Promise.allSettled` — one conference failing doesn't affect others.
- **Registration filtering**: Skip blank name (checks answers before giving up), skip incomplete (`!registration.completed`).
- **Status calculation**: completed+withdrawn=Canceled, completed+checkedIn=Attended, completed=Registered, else Incomplete.
- **Post-event suppression**: once a conference's event end has passed (local zone, DST-aware — `hasEventEnded` in `field-mapping.ts`), only `Canceled` records are sent; everything else is dropped and counted as `registrantsSuppressedPostEvent`. FamilyLife request (Aug 2026): post-event, SF only needs withdrawals — any other resend carries a stale status that clobbers statuses they set after event close. Fails open: a missing or unparseable end time sends the record. `scripts/reconcile.ts` disables suppression (it must still find records lost pre-event) but holds post-event non-Canceled missing records for manual review instead of inserting them.
- **FL Registration Type**: Prefer `fl_registration_type` tag answer, fall back to parsing registrant type name (Military/Pastor/Attendee).
- **Church address tag**: Note triple 's' in `fl_church_addresss` — this is the actual ERT tag name, not a typo.
- **DATE vs DATETIME columns**: ERT sends every registration timestamp as true UTC, but the SF fields they land in are not all the same type, and a Salesforce DATE column carries no timezone — it keeps whatever calendar date it is handed. Handing one a UTC instant files the *GMT* date, so anything after 20:00 Eastern lands a day late. Which helper to use is decided by the SF column type, not by the ERT value:

  | SF field | SF type | Helper |
  |---|---|---|
  | `Date_Registered__c`, `Date_Cancelled__c` | **DATE** | `utcTimestampToSalesforceDate` (Eastern calendar date) |
  | `Date_Check_In__c`, `ERT_Last_Updated__c`, `Involvement_Registration_Created_Date__c` | DATETIME | `utcTimestampToSalesforce` (precision only) |
  | `Event_Start_Date__c`, `Event_End_Date__c` | DATETIME | `localTimeToSalesforce` (zone-aware; conference times are zone-less wall clock) |

  Re-verify the type before adding a date field — `.../sobjects/Staging_Involvement__c/describe`. Reported by FamilyLife (Mona Horton) Sep 2026; 400 of 2,000 sampled rows were a day late. Fixed in PR #22. Historical records were left as-is.
- **Downstream `Registration__c` is FamilyLife's, not ours**: `Check_in_Date__c` and `ERT_Updated__c` there are DATE columns fed from our DATETIME staging fields. That reduction happens in Salesforce and uses GMT, so it has the same off-by-a-day symptom. We send those correctly; a fix has to come from the FamilyLife SF side.
- **Field lengths**: All string fields are truncated to their real SF column length by `enforceFieldLengths` in `registration-transformer.ts`, driven by `SF_FIELD_MAX_LENGTHS` in `field-mapping.ts` (generated from the production describe endpoint). An over-length value fails the whole `allOrNone` insert, blocking every record in the run. Regenerate the map after SF schema changes.
- **Phone answers**: Sanitized to digits and phone punctuation. A value still over 15 chars, or with no digits, is dropped and logged rather than truncated — a clipped phone number is a wrong one.

## Configuration

Config loaded from env vars via `getConfig()` in `src/config/index.ts` (cached after first call). Required env vars: `ERT_BASE_URL`, `ERT_API_KEY`, `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SSM_LAST_IMPORT_DATE_PARAM`. Use `resetConfig()` in tests to clear the cache.

Rollbar enabled only in `staging`/`production` environments.

## Testing

- Vitest with v8 coverage. Tests in `tests/unit/` mirror the `src/` structure.
- Vitest globals enabled — no need to import `describe`, `it`, `expect`, etc.
- Test setup loads `.env.test` via dotenv (`tests/setup.ts`).
- Pure function tests (answer-processor, registration-transformer, field-mapping) use fixture factories from `tests/fixtures/` — no mocking.
- Fixture factories (all accept partial overrides): `makeRegistration()`, `makeRegistrant()`, `makeAnswer()` in `registrations.ts`; `makeConferenceDetail()` in `conferences.ts`; `makeBlockLookups()` in `blocks.ts`.
- Service tests mock `global.fetch` (ERT, SF) and `@aws-sdk/client-ssm` (SSM) via `vi.mock`.

## Deployment

- Docker-based Lambda deployment via GitHub Actions
- esbuild bundles to CJS (`dist/handler.js`), `@aws-sdk/*` externalized (available in Lambda runtime)
- Datadog for metrics/logs, secrets-lambda-extension for runtime secrets
- Node 24 (see `.tool-versions`)

## Conventions

- **Path alias**: `@` maps to `./src` in both vitest and esbuild. Use `@/services/ert` style imports.
- **Unused vars**: Prefix with `_` to satisfy ESLint (`argsIgnorePattern: '^_'`).
- **`noImplicitAny: false`**: Implicit `any` is allowed but `@typescript-eslint/no-explicit-any` is warn-level.

## Scripts

- `scripts/reconcile.ts` — Compare ERT against the SF staging object and report (or with `--apply`, insert) registrations that never arrived. Dry run by default; post-event non-Canceled records are held for manual review, never auto-inserted. `scripts/` is outside `tsconfig` — typecheck it explicitly with `npx tsc --noEmit ... scripts/reconcile.ts`.
  ```bash
  npx tsx scripts/reconcile.ts [--since <ISO-8601>] [--apply]
  ```
- `scripts/run-from-date.ts` — Run the sync locally with a custom `lastImportDate` cursor (requires assumed AWS role for env vars). SSM update is stubbed.
  ```bash
  npx tsx scripts/run-from-date.ts <ISO-8601-date>
  # Example: npx tsx scripts/run-from-date.ts 2026-03-11T20:00:00Z
  ```

## Environments

**Objects:** `Staging_Involvement__c` is what this Lambda writes. (`Staging_Involvement_Object__c` does not exist — that name 404s on the describe endpoint.) FamilyLife's downstream object is `Registration__c`.

**Stage has been broken since 2026-04-28.** Verified 2026-09-08. The Lambda runs on schedule (`lambda-trigger-family-life-stage`, `cron(0 13-23 ? * MON-FRI *)`, ENABLED) and fails every time at `getConferenceIds`:

```
ERT API error 401 for /integrations/conferences: Invalid authorization code: ...5e54
```

`/ecs/family-life/stage/ERT_API_KEY` has not changed since 2026-02-24, so ERT invalidated the key on their side. Needs a replacement from the ERT team. Not IP allowlisting — a local run and the Lambda get the identical error with the identical key fingerprint. Stage Salesforce (`familylife--uat`) creds also fail locally with `invalid_client_id`; untested inside the Lambda because the run dies at ERT first. Expect a second failure there after the key is replaced.

Because the cursor is only written after a successful insert, `/parameters/family-life/stage/ERTSyncLastImportDate` is frozen at `2026-04-28T15:00:07.484Z`. **Consequence: the `On Staging` label deploys but verifies nothing.** PRs #20, #21 and #22 were all labeled and deployed to stage without ever executing there.

**Reading stage logs.** The `family-life-stage` SSO role has no CloudWatch permissions at all (`GetMetricStatistics`, `DescribeLogGroups`, `DescribeLogStreams`, `FilterLogEvents` all denied). Use the invoke log tail instead:

```bash
aws lambda invoke --function-name family-life-stage-registrationsToSF \
  --log-type Tail --payload '{"source":"aws.events","detail-type":"Scheduled Event","detail":{}}' \
  --cli-binary-format raw-in-base64-out /tmp/out.json \
  --query 'LogResult' --output text | base64 -d
```

A thrown handler error surfaces in the response as `Runtime.ExitError: Runtime exited without providing a reason` — that is the Datadog wrapper, not an init crash. The real error is only in the log tail.

**Verifying a transform change without stage.** `processConference` fetches from ERT and *returns* records; the orchestrator is what inserts. So the real pipeline can be run against **production** ERT read-only, writing nothing to Salesforce. Build a `Services` object containing only `ert` (`{ ert } as unknown as Services`), call `processConference` per conference, and correlate each record back to its source registration via ``record.Involvement_External_Id__c === `ERTREG-${registration.id}` ``. Correlate on that, not on `Involvement_Registration_Created_Date__c` — created and completed can straddle midnight and produce false failures. This verified PR #22 across 5,211 records / 86 conferences.

Credentials from `cru app secrets read -e production --keys ...` into a file, then `set -a; . file; set +a`. Do not `eval` with `sed 's/^/export /'` if values could contain shell metacharacters. Delete the file afterward.

## Assumed Roles

At the beginning of every conversation, and when resuming conversations, check the following environment variables to see if you have assumed an AWS role:
- ENVIRONMENT: Could be `staging` or `production`, and gives you an idea of which role you have assumed.
- AWS_ACCESS_KEY_ID: If set with a value length > 0, means you have actually assumed the role.
