# TLS Trust Store (Phase 2)

| File | Purpose |
|------|---------|
| `dev-ca.crt` (generated into `../development/live/ca/ca.crt`) | Trust for local HTTPS / WSS / SIP TLS / provisioning |
| Production | Install platform or enterprise CA / public chain via ACME or PKI |

Grandstream: enable **Validate Server Certificates** and install the Dev CA (or enterprise CA) on the device/trust path when using private PKI ([ADR-042](../../docs/ADR/ADR-042-provisioning-edge-url-scheme.md)).

Do not place private keys in this directory.
