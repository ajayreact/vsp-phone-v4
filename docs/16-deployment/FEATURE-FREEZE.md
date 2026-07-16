# Feature Freeze — RC1

| Field | Value |
|-------|-------|
| **Effective** | 2026-07-17 |
| **Status** | **ACTIVE** |
| **Authority** | [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) |
| **Current gate** | RC Approved for Internal Testing |

## Binding rule

**No further product development is authorized.** The codebase is under Release Candidate governance.

## Allowed

- Critical bug fixes  
- Security fixes  
- Deployment fixes  
- Environment configuration fixes  
- Performance optimizations  
- Logging and monitoring improvements  
- Documentation updates  

## Not allowed

- New PBX features  
- UI redesigns  
- Database redesigns  
- API contract changes (unless required to fix a critical defect)  
- New workflows  
- Refactoring unrelated modules  

## Promotion

The only approved path is documented in [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md). On any failure: stop → defect report → fix blocker only → restart from the beginning.

## Exit

Governance lifts only after **General Availability** final sign-off (or a written product-owner exception for a critical defect). Customer Pilot does not authorize new feature work.
