# One DID ↔ One Extension — Migration Validation Report

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Result | **NOT EXECUTED** (local environment) |
| Reason | Local Postgres rejected `vsp` credentials |

## How to run after migrate deploy

```bash
npx prisma migrate deploy
npm run platform:validate-one-did
```

Safe repairs (default): detach extra DIDs on a line, soft-delete duplicate/orphan inbound routes, clear `line_id` on soft-deleted phones.

Fatal (stops deploy): remaining duplicate extensions, duplicate DIDs, multi-DID lines, orphan lines that still have a DID, orphan routes.
