# NEXTGEN Architecture

## Context

NEXTGEN is a multi-tenant operations SaaS for more than 100 clients. A tenant may own multiple outlets and generate at least 1,000 records daily. The initial system is a modular monolith deployed as one Next.js service on Railway with PostgreSQL.

## Runtime shape

```text
Browser
  │ HTTPS + HttpOnly session cookie
  ▼
Next.js on Railway
  ├─ App Router pages and server components
  ├─ Route handlers / server actions
  ├─ Auth + permission policy
  ├─ Domain services and tenant-scoped repositories
  ├─ Audit writer
  └─ JFS integration adapter ──► jfs-middleware
  │
  ▼
Railway PostgreSQL
```

## Module boundaries

Code under `src/modules` owns domain types, validation, services, and repositories. UI code may call services but must not query Prisma directly. Cross-module behavior goes through exported service contracts. Shared infrastructure lives under `src/lib`.

Initial modules are auth, tenants, outlets, users, pickup, dispatch, cod, settlement, payment, monitoring, inventory, finance, hr, salary, quality-control, and integrations.

## Tenant isolation

1. Login resolves the user and tenant on the server.
2. A cryptographically random opaque session token is stored only in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. The database stores only its SHA-256 hash.
3. `requireSession()` loads the active session and returns trusted `tenantId`, `userId`, `outletId`, and roles.
4. Route handlers ignore/reject client-supplied tenant identity.
5. Repository methods require a trusted tenant context and include `tenantId` in every transaction predicate.
6. Unique constraints and indexes include tenant scope where business identifiers are tenant-local.

Prisma middleware is not treated as the sole isolation boundary because nested and raw queries can bypass it. Explicit tenant-scoped repository APIs plus authorization tests are the primary control; PostgreSQL Row Level Security can be added as defense-in-depth after the access model stabilizes.

## Authentication and authorization

- Passwords use Argon2id. Parameters are provided by the maintained `argon2` implementation and can be rehashed on login when policy changes.
- Session tokens carry no tenant data and expire server-side. Logout revokes the database session before clearing the cookie.
- Roles are tenant-owned records identified by stable role codes. A user may have multiple roles through `UserRole`.
- Permissions are checked server-side near domain operations. Hiding navigation items is a UX concern, not authorization.
- Login/logout and important create/update/delete operations write audit records.

## Integration secrets

`IntegrationCredential.encryptedPayload` stores an authenticated encryption envelope, not plaintext. The application encryption key is supplied by Railway and versioned with `keyVersion`. Encryption/decryption stays server-side. Logs must never contain payloads, tokens, cookies, passwords, or database URLs.

## Data and performance

- UUID primary keys avoid tenant collision and ease distributed imports.
- Monetary values use PostgreSQL `numeric`, never floating point.
- Timestamps are stored in UTC and formatted in the tenant timezone.
- High-volume tables must use composite indexes led by `tenantId` and server-side/keyset pagination.
- Request paths remain short; scraping, imports, and bulk reports belong in asynchronous jobs.
- Production uses PostgreSQL connection pooling; migrations use a direct connection when supplied.

## Error handling and observability

Domain errors map to a stable JSON error envelope: `{ error: { code, message, fieldErrors? } }`. Unexpected errors receive a correlation ID and sanitized log entry. Audit logs capture actor, tenant, action, entity, selected metadata, IP, and user agent without secrets.

Recommended production telemetry: structured logs, request latency/error rate, database pool utilization, slow queries, authentication failures, job lag, integration failures, and tenant-aware operational metrics without tenant secrets.

## Deployment

Railway builds the Next.js standalone output, runs `prisma migrate deploy` as a pre-deploy command, and starts the web service. Deployments are backward-compatible: additive database migration first, compatible application second, destructive cleanup only in a later release. PostgreSQL backups and restore drills are required before cutover.

## Decisions deferred

- Exact transaction schemas until legacy workbook/workflow discovery.
- Queue provider until worker throughput and operational needs are measured.
- PostgreSQL RLS until connection/session transaction semantics are proven.
- SSO, MFA, and custom roles after initial tenant onboarding feedback.
