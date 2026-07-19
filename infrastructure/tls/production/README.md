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

### RC1 EC2 (Let's Encrypt → prov-edge)

Public TLS terminates at host nginx. Prov-edge still needs PEMs on `:3444`.

```bash
# On EC2 — copy LE material into the Compose bind mount (resolves LE symlinks)
bash scripts/platform/sync-le-prov-tls.sh
# → infrastructure/tls/production/live/prov/{fullchain,privkey}.pem
# mounted read-only at /etc/vsp/tls/prov inside vsp-api
```

`docker-compose.prod.yml` also mounts `/etc/letsencrypt` so Nest can fall back to
`/etc/letsencrypt/live/prov.vspphone.com/` if the sync dir is empty.

Set `TLS_ENV=production`. Do **not** use `infrastructure/tls/development/live`.
