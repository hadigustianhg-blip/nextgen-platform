# NEXTGEN Operations System

Secure multi-tenant operations SaaS foundation built with Next.js App Router, strict TypeScript, Tailwind CSS, PostgreSQL, and Prisma. Phase 1 includes the core tenant schema, Argon2id authentication, opaque database-backed sessions, RBAC foundations, audit logs, encrypted integration credentials, a protected application shell, and a typed mock dashboard service.

See [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for the staged migration and [ARCHITECTURE.md](./ARCHITECTURE.md) for security and scaling decisions.

## Requirements

- Node.js 22.13 or newer
- npm 11 or newer
- PostgreSQL 15 or newer

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and update the PostgreSQL URLs. Generate the encryption key with:

   ```bash
   openssl rand -base64 32
   ```

3. Apply the migration and seed development data:

   ```bash
   npm run db:deploy
   npm run db:seed
   ```

4. Start the application:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000`. Development seed login:

- Tenant: `nextgen-demo`
- Email: `owner@nextgen.local`
- Password: `SEED_OWNER_PASSWORD`, or `NextgenDev123!` when seeding outside production without that variable

Never use the default development password in a shared or production environment.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled PostgreSQL connection used by the application |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection used for migrations |
| `SESSION_COOKIE_NAME` | No | Cookie name; defaults to `nextgen_session` |
| `SESSION_TTL_HOURS` | No | Server-side session lifetime; defaults to 168 hours |
| `INTEGRATION_ENCRYPTION_KEY` | Yes for integrations | Base64-encoded 32-byte AES-256-GCM key |
| `SEED_OWNER_PASSWORD` | Production seed only | Password for the seeded development owner |

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Railway deployment

1. Create or select a Railway project and attach the existing PostgreSQL service.
2. Create a web service from this repository. Do not point it at either `jfs-middleware` repository.
3. Configure the environment variables above. Railway commonly provides `DATABASE_URL`; add a direct PostgreSQL URL as `DIRECT_URL`. Set `NODE_ENV=production` and a new encryption key.
4. Set the build command to `npm ci && npm run build`.
5. Set the pre-deploy command to `npm run db:deploy`.
6. Set the start command to `npm run start`.
7. Deploy to staging first, seed only if explicitly required, verify login and tenant isolation, then promote.

The app uses Next.js standalone output and Railway's injected `PORT`. Migrations must be forward-compatible. Do not run `prisma migrate dev` in production, and do not expose scraper credentials as public variables.

## Security notes

- Tenant identity is resolved from the server-side session, never trusted from browser input.
- Raw session tokens live only in secure HTTP-only cookies; PostgreSQL stores SHA-256 hashes.
- Passwords are Argon2id hashes.
- Integration credential payloads use AES-256-GCM authenticated encryption.
- The current dashboard data is deliberately provided by a tenant-context-requiring service, ready to be replaced by scoped repository queries.
- Route protection in `src/proxy.ts` is an early redirect optimization. Protected pages still call `requireSession()` and validate the database session.
