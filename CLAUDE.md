# FamilyLife ERT Sync Lambda

Syncs WTR (Weekend to Remember) event registrations from ERT (Event Registration Tool) to Salesforce `Staging_Involvement_Object__c`. Runs every 15 minutes via EventBridge.

## Quick Reference

```bash
npm test            # Run tests with coverage
npm run typecheck   # TypeScript checking
npm run lint        # ESLint
npm run build       # Bundle to dist/handler.js
```

## Architecture

- **Entry Point**: `src/index.ts` - Re-exports handler for Datadog wrapper
- **Handler**: `src/handlers/sync.ts` - EventBridge entry point
- **Orchestrator**: `src/core/orchestrator.ts` - Main sync flow
- **Conference Processor**: `src/core/conference-processor.ts` - Per-conference logic
- **Registration Transformer**: `src/core/registration-transformer.ts` - ERT registrant to SF staging record
- **Answer Processor**: `src/core/answer-processor.ts` - Block answer processing (profileType + blockTagType)
- **Field Mapping**: `src/core/field-mapping.ts` - SF field constants, tag-to-field maps, status/type helpers

## Services

- **ERT**: `src/services/ert.ts` - ERT REST API client (fetch-based, API key auth)
- **Salesforce**: `src/services/salesforce.ts` - jsforce with OAuth 2.0 client_credentials
- **SSM**: `src/services/ssm.ts` - AWS SSM Parameter Store for lastImportDate cursor

## Key Business Rules

- **Insert-only** to SF staging object (no upsert). SF consumes and removes records after processing.
- **Conference isolation**: `Promise.allSettled` - one conference failing doesn't affect others.
- **Registration filtering**: Skip blank name, skip incomplete.
- **Status calculation**: completed+withdrawn=Canceled, completed+checkedIn=Attended, completed=Registered, else Incomplete.
- **FL Registration Type**: Prefer `fl_registration_type` tag, fall back to parsing registrant type name (Military/Pastor/Attendee).
- **Church address tag**: Note triple 's' in `fl_church_addresss` - this is the actual ERT tag name.

## Deployment

- Docker-based Lambda deployment via GitHub Actions
- Datadog integration for metrics/logs
- secrets-lambda-extension for runtime secrets
- Node 24 (see `.tool-versions`)

## Environment

- Node 24+, TypeScript ES2024, CommonJS output (esbuild)
- `@aws-sdk/client-ssm` is a dev dependency (available in Lambda runtime)
- `jsforce` v3 for Salesforce
- `rollbar` for error tracking (enabled in staging/production only)

## Testing

- Vitest with v8 coverage
- Pure function tests (answer-processor, registration-transformer, field-mapping) use fixture factories, no mocking
- Service tests mock `global.fetch` (ERT/SF) and `@aws-sdk/client-ssm` (SSM)
- Test fixtures in `tests/fixtures/`
