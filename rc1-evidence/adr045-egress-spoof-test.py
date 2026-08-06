#!/usr/bin/env python3
"""ADR-045 gate: the X-VSP-Egress marker must only be honoured on the internal socket.

Sends one INVITE carrying `X-VSP-Egress: telnyx` to Kamailio's PUBLIC socket. A correct
edge answers 403 Forbidden (or otherwise refuses); anything that looks like the call was
accepted for carrier egress is unauthenticated PSTN access.

    python3 adr045-egress-spoof-test.py [host] [port]
"""
import socket
import sys
import time
import uuid

host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5060

call_id = f"adr045-spoof-{uuid.uuid4().hex[:12]}"
branch = f"z9hG4bK-adr045-{uuid.uuid4().hex[:8]}"

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(4.0)
sock.bind(("", 0))
local_port = sock.getsockname()[1]

invite = (
    f"INVITE sip:+15550000000@sip.telnyx.com SIP/2.0\r\n"
    f"Via: SIP/2.0/UDP 127.0.0.1:{local_port};branch={branch};rport\r\n"
    f"Max-Forwards: 70\r\n"
    f"From: <sip:attacker@127.0.0.1>;tag=adr045spoof\r\n"
    f"To: <sip:+15550000000@sip.telnyx.com>\r\n"
    f"Call-ID: {call_id}\r\n"
    f"CSeq: 1 INVITE\r\n"
    f"Contact: <sip:attacker@127.0.0.1:{local_port}>\r\n"
    f"X-VSP-Egress: telnyx\r\n"
    f"Content-Length: 0\r\n"
    f"\r\n"
)

print(f"target      : {host}:{port}")
print(f"call-id     : {call_id}")
sock.sendto(invite.encode(), (host, port))

deadline = time.time() + 4.0
statuses = []
while time.time() < deadline:
    try:
        data, _ = sock.recvfrom(65535)
    except socket.timeout:
        break
    line = data.decode(errors="replace").split("\r\n", 1)[0]
    statuses.append(line)
    print(f"response    : {line}")
    # 100 Trying is only a provisional ack of receipt; keep reading for the final answer.
    if not line.startswith("SIP/2.0 1"):
        break

sock.close()

finals = [s for s in statuses if not s.startswith("SIP/2.0 1")]
if not finals:
    # Silence is also a refusal: nothing was routed to the carrier.
    print("RESULT=BLOCKED (no final response; request was not routed to the carrier)")
    sys.exit(0)

code = finals[-1].split()[1] if len(finals[-1].split()) > 1 else "000"
if code.startswith("4") or code.startswith("5") or code.startswith("6"):
    print(f"RESULT=BLOCKED (final {code})")
    sys.exit(0)

print(f"RESULT=ACCEPTED (final {code}) -- SECURITY FAILURE: public socket honoured X-VSP-Egress")
sys.exit(1)
