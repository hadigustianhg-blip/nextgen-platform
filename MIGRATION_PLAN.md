# NEXTGEN Migration Plan

## Repository audit

The repository contained only an empty Git repository when migration work began. There was no legacy application code, database schema, deployment configuration, or test suite to preserve. The production `jfs-middleware` and development `jfs-middleware-v2` services are outside this repository and are not modified.

## Guiding constraints

- Preserve the legacy workflows and visual language while replacing Google Apps Script and Sheets incrementally.
- Keep NEXTGEN as a modular monolith until scale or team boundaries justify extraction.
- Treat tenant isolation as an invariant: tenant identity comes from the server session, never request input.
- Import historical data through idempotent, auditable jobs after per-sheet mapping and reconciliation.
- Integrate with the existing scraper through a server-to-server adapter; never expose integration credentials to the browser.

## Delivery phases

### Phase 1 — Foundation (this repository)

- Next.js App Router, strict TypeScript, Tailwind, Prisma/PostgreSQL.
- Tenant, outlet, user, role, session, audit, and encrypted integration credential schema.
- Argon2id login, opaque cookie sessions, role-aware protected dashboard.
- Responsive application shell and typed mock dashboard service.
- Railway setup documentation and baseline quality gates.

### Phase 2 — Discovery and data mapping

1. Inventory every legacy screen, Apps Script endpoint, scheduled trigger, and Google Sheet.
2. Capture representative sanitized datasets and business rules.
3. Define canonical schemas for pickup, dispatch, COD, settlement, payment, monitoring, inventory, finance, HR, salary, and QC.
4. Define reconciliation totals and acceptance tests per module.
5. Establish retention, backup, and tenant offboarding policies.

### Phase 3 — Operational vertical slices

Implement one end-to-end workflow at a time, suggested order:

1. Outlets, users, memberships, and permissions.
2. Pickup and dispatch.
3. COD and settlement.
4. Monitoring and payment.
5. Quality control.
6. Finance, HR, and salary.

Each slice includes tenant-scoped repositories, validation, audit events, pagination, tests, import scripts, and user acceptance testing.

### Phase 4 — JFS integration

- Document the `jfs-middleware` contract and add signed/authenticated server-to-server calls.
- Store encrypted credentials per tenant/integration with key rotation support.
- Add idempotency keys, retry with backoff, timeouts, circuit breaking, and dead-letter visibility.
- Test against `jfs-middleware-v2`; promote configuration only after reconciliation. Do not modify production scraper code.

### Phase 5 — Migration and cutover

1. Dry-run imports into an isolated staging tenant.
2. Compare row counts, monetary totals, and status distributions.
3. Run parallel operations for an agreed window.
4. Freeze legacy writes, run delta import, reconcile, and switch users.
5. Keep a time-boxed rollback path and exportable audit evidence.

## Scale plan

- Add composite indexes beginning with `tenantId` on all high-volume access paths.
- Use keyset pagination for growing transaction tables; avoid unbounded list endpoints.
- Use pooled PostgreSQL connections on Railway and a direct URL for migrations.
- Move long-running imports, scraper synchronization, and report generation to a worker/queue.
- Partition or archive high-volume audit and transaction data when measurements justify it.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Cross-tenant data exposure | Session-derived tenant scope, repository boundaries, authorization tests, optional PostgreSQL RLS defense-in-depth |
| Spreadsheet semantics are undocumented | Workflow inventory, sanitized fixtures, reconciliation checks, user acceptance tests |
| Duplicate scraper/import events | External IDs, unique constraints, idempotency keys |
| Connection exhaustion | Pooling, bounded concurrency, observability |
| Cutover data drift | Parallel run, freeze window, delta import, signed reconciliation |

## Definition of done per module

Schema and migration reviewed; authorization matrix defined; all reads/writes tenant-scoped; Zod validation and consistent errors added; audit coverage present; server-side pagination used; unit/integration tests pass; reconciliation and rollback documented; production observability is available.
