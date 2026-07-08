# Certificate and TLS automation (Phase 2)

| Script | Purpose |
|--------|---------|
| `generate-dev-certs.cjs` | Dev CA + leaf certs (Node crypto; primary) |
| `generate-dev-certs.sh` | OpenSSL alternative (Linux/macOS) |
| `generate-dev-certs.ps1` | Legacy PowerShell attempt (prefer `.cjs` on Windows) |
| `validate-certs.cjs` | Parse PEMs, check layout, HTTPS smoke |
| `rotate-dev-certs.sh` / `.ps1` | Backup live + regenerate |

```bash
npm run tls:generate
npm run tls:validate
```
