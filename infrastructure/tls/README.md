# TLS / PKI (Phase 2)

## Layout

```text
infrastructure/tls/
  openssl/                 # OpenSSL configs (tracked)
  trust-store/             # Public CA copies for clients (generated *.crt gitignored)
  development/live/        # Generated PEMs (gitignored)
  staging/                 # Placeholders for staging PKI
  production/              # Placeholders for LE / enterprise PKI
```

## Generate (development)

```bash
npm run tls:generate
npm run tls:validate
```

## Consumers

| Consumer | Path (container / host) |
|----------|-------------------------|
| NestJS HTTPS | `TLS_API_CERT_FILE` / `TLS_API_KEY_FILE` when `TLS_ENABLED=true` |
| Kamailio SIP TLS + WSS | `/etc/kamailio/tls/{privkey,fullchain,ca}.pem` via Compose |
| Provisioning | `TLS_PROV_*` (edge Phase 17) |
| Browsers / Grandstream | Trust `trust-store/dev-ca.crt` |

## Rotation

`npm run tls:rotate` (or `scripts/tls/rotate-dev-certs.*`) backs up `live/` then regenerates. Reload Kamailio/API after distribution. Dual-publish windows are operational, not automated in Phase 2.

## Production / future

Do not commit production keys. Mount from secret store / ACME. See `production/README.md`.
