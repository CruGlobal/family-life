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

Syncs WTR (Weekend to Remember) event registrations from ERT (Event Registration Tool) to Salesforce `Staging_Involvement_Object__c`. Runs every 15 minutes via EventBridge.

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
- **FL Registration Type**: Prefer `fl_registration_type` tag answer, fall back to parsing registrant type name (Military/Pastor/Attendee).
- **Church address tag**: Note triple 's' in `fl_church_addresss` — this is the actual ERT tag name, not a typo.
- **Group_Name__c**: Truncated to 100 characters.

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

- `scripts/run-from-date.ts` — Run the sync locally with a custom `lastImportDate` cursor (requires assumed AWS role for env vars). SSM update is stubbed.
  ```bash
  npx tsx scripts/run-from-date.ts <ISO-8601-date>
  # Example: npx tsx scripts/run-from-date.ts 2026-03-11T20:00:00Z
  ```

## Assumed Roles

At the beginning of every conversation, and when resuming conversations, check the following environment variables to see if you have assumed an AWS role:
- ENVIRONMENT: Could be `staging` or `production`, and gives you an idea of which role you have assumed.
- AWS_ACCESS_KEY_ID: If set with a value length > 0, means you have actually assumed the role.
