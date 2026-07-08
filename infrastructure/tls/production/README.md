# Production TLS

Place leaf + chain certificates here in deployment pipelines (not in git):

```text
live/
  api/fullchain.pem  privkey.pem
  sip/fullchain.pem  privkey.pem
  wss/fullchain.pem  privkey.pem   # often same as sip for Kamailio
  prov/fullchain.pem privkey.pem
  ca/                # optional intermediate bundle for clients
```

Sources (future — not automated in Phase 2):

- Let's Encrypt / ACME
- Corporate internal CA
- Enterprise PKI / HSM-backed issuance

Set `TLS_ENV=production` and path env vars to point at these files (or secret mounts).
