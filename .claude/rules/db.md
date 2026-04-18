---
description: SQLite migration and query discipline
paths:
  - "src/db/**"
alwaysApply: false
---

- One migration file per schema version, numbered `001_initial.sql`, `002_*.sql`. Migrations are additive — **never `DROP`** without a follow-up rescue plan.
- All queries use parameter binding (`db.query("SELECT ... WHERE x = ?").get(x)` or `.all(...)`). Never string-interpolate user input.
- Multi-statement writes run inside a transaction via `db.transaction(fn)()`.
- Expiry sweeps use indexed columns (`expires_at`) and run both lazily on lookup and periodically via `setInterval(..., 5 * 60_000).unref()`.
- Connection is a singleton from `src/db/index.ts`; tests open a fresh in-memory connection via `createDb(":memory:")`.
