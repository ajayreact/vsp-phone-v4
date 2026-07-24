#!/usr/bin/env python3
"""RC1 — replace REGISTRAR digest parse block + fix jansson body init in kamailio.cfg."""
from pathlib import Path

CFG = Path("infrastructure/kamailio/kamailio.cfg")

DIGEST_BLOCK = """    # Digest: $au/$ar + $sel(authorization["realm"].*) — =~ fails on base64 nonce (+/=)
    $var(auth_user) = $au;
    $var(auth_realm) = $ar;
    $var(auth_hdr) = $hdr(Authorization);
    if ($var(auth_user) == $null || $var(auth_user) == "") {
        $var(auth_user) = $sel(authorization["sip.vspphone.com"].username);
    }
    if ($var(auth_realm) == $null || $var(auth_realm) == "" || $var(auth_realm) == "0") {
        $var(auth_realm) = $sel(authorization["sip.vspphone.com"].realm);
    }
    if ($var(auth_realm) == $null || $var(auth_realm) == "" || $var(auth_realm) == "0") {
        $var(auth_realm) = $td;
    }
    $var(auth_nonce) = $sel(authorization["sip.vspphone.com"].nonce);
    $var(auth_resp) = $sel(authorization["sip.vspphone.com"].response);
    $var(auth_uri) = $sel(authorization["sip.vspphone.com"].uri);
    if ($var(auth_uri) == $null || $var(auth_uri) == "" || $var(auth_uri) == "0") {
        $var(auth_uri) = $ru;
    }
"""


def main() -> None:
    text = CFG.read_text(encoding="utf-8")
    start = text.find("    # Digest")
    if start < 0:
        raise SystemExit(f"ERROR: digest marker not found in {CFG}")
    tail = text.index("#!ifdef RC1_SIP_DIGEST_TRACE", start)
    text = text[:start] + DIGEST_BLOCK + "\n" + text[tail:]

    # jansson_set requires "{}" not "" or $null
    text = text.replace('$var(body) = "";', '$var(body) = "{}";')
    text = text.replace("$var(body) = $null;", '$var(body) = "{}";')

    backup = CFG.with_suffix(".cfg.bak.fix")
    backup.write_text(CFG.read_text(encoding="utf-8"), encoding="utf-8")
    CFG.write_text(text, encoding="utf-8")
    print(f"OK: backup -> {backup}")
    print("OK: digest block + jansson body={} applied")


if __name__ == "__main__":
    main()
