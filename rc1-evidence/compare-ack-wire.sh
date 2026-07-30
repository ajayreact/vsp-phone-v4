#!/usr/bin/env bash
# RFC 3261 field comparison: Telnyx 200 OK vs Kamailio ACK from same-call pcap.
# Usage: bash rc1-evidence/compare-ack-wire.sh <pcap> [callid-substring]
set -euo pipefail
PCAP="${1:?usage: compare-ack-wire.sh <pcap> [callid]}"
CID="${2:-}"
OUT="/tmp/compare-ack-$$"
mkdir -p "$OUT"

python3 <<PY
import subprocess,re,sys
pcap="$PCAP"
cid="$CID"
raw=subprocess.check_output(['sudo','tcpdump','-nn','-tttt','-A','-s0','-r',pcap],stderr=subprocess.DEVNULL).decode('latin1','replace')
blocks=re.split(r'(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )', raw)
def parse_msg(body):
    lines=body.splitlines()
    start=0
    for i,l in enumerate(lines):
        if l.startswith(('SIP/2.0','INVITE ','ACK ','BYE ')):
            start=i; break
    msg=[]
    for l in lines[start:]:
        if re.match(r'^[0-9a-f]{4}\s', l): break
        if l.startswith('E..') and len(msg)>3: break
        msg.append(l.rstrip())
        if l.strip()=='' and len(msg)>5: break
    return '\n'.join(msg)
def fields(msg):
    d={}
    for line in msg.splitlines()[1:]:
        if ':' in line and not line.startswith(' '):
            k,v=line.split(':',1); d.setdefault(k.strip(),[]).append(v.strip())
    d['start']=msg.split('\n',1)[0] if msg else ''
    return d
ok200=None; ack_post=[]; invite_auth=None
for b in blocks:
    if cid and cid not in b: continue
    hdr=b.split('\n',1)[0]
    body=b.split('\n',1)[1] if '\n' in b else ''
    msg=parse_msg(body)
    if not msg: continue
    ts=hdr.split()[0]+' '+hdr.split()[1]
    ip=hdr.split(' IP ',1)[1] if ' IP ' in hdr else hdr
    f=fields(msg)
    if 'SIP/2.0 200 OK' in msg and 'INVITE' in (f.get('CSeq',[''])[0]) and '192.76.120.10' in hdr and '> 172.31' in hdr:
        if ok200 is None: ok200={'ts':ts,'ip':ip,'f':f,'msg':msg}
    if msg.startswith('ACK '):
        ack_post.append({'ts':ts,'ip':ip,'f':f,'msg':msg})
    if msg.startswith('INVITE ') and '172.31' in hdr and '192.76.120.10' in hdr:
        invite_auth={'ts':ts,'ip':ip,'f':f,'msg':msg}
# pick first ACK after 200 OK
ack=None
if ok200:
    for a in ack_post:
        if a['ts']>ok200['ts']: ack=a; break
print('=== SIP LADDER ===')
for label,obj in [('INVITE',invite_auth),('200_OK',ok200),('ACK',ack)]:
    if not obj: continue
    print(f"--- {label} {obj['ts']} {obj['ip']} ---")
    print(obj['msg'][:2000])
    print()
keys=['start','Call-ID','From','To','CSeq','Contact','Via','Route','Record-Route','Max-Forwards']
print('=== COMPARISON TABLE ===')
print(f"{'Field':<16} {'RFC/Telnyx req':<40} {'200 OK':<40} {'ACK':<40} {'Match'}")
for k in keys:
    req=''
    if k=='start': req='R-URI = Contact when route empty'
    if k=='CSeq': req='same number, method ACK'
    if k=='Route': req='reversed RR; all Route hops'
    v200=ok200['f'].get(k,[''])[0] if ok200 else ''
    if k=='start' and ok200:
        v200=ok200['f'].get('Contact',[''])[0]
    if k=='Route' and ack:
        vack=' | '.join(ack['f'].get('Route',[]))
    elif k=='Route' and ok200:
        v200=' | '.join(ok200['f'].get('Record-Route',[]))
    elif k=='start' and ack:
        vack=ack['f'].get('start',[''])[0]
    else:
        vack=ack['f'].get(k,[''])[0] if ack else ''
    match=''
    if k=='start' and ok200 and ack:
        c=ok200['f'].get('Contact',[''])[0].strip('<>')
        r=ack['f'].get('start',[''])[0].replace('ACK ','').strip()
        match='YES' if c in r or r in c else 'NO'
    elif k in ('Call-ID','From','To') and v200 and vack:
        match='YES' if v200==vack else 'NO'
    elif k=='CSeq' and v200 and vack:
        n200=v200.split()[0]; nack=vack.split()[0]
        match='YES' if n200==nack and 'ACK' in vack else f'NO ({n200}!={nack})'
    elif k=='Route' and ok200 and ack:
        rr=list(reversed(ok200['f'].get('Record-Route',[])))
        ar=ack['f'].get('Route',[])
        match='YES' if len(ar)>=len(rr) and all(a.strip('<>')==b.strip('<>') or b.strip('<>') in a for a,b in zip(ar,rr)) else 'NO'
    print(f"{k:<16} {req:<40} {str(v200)[:40]:<40} {str(vack)[:40]:<40} {match}")
if not ok200: print('ERROR: no carrier 200 OK found', file=sys.stderr); sys.exit(1)
if not ack: print('ERROR: no post-200 ACK found', file=sys.stderr); sys.exit(1)
# Next-hop check: Asterisk/Telnyx require UDP dst = first Route hop (192.76.120.10), not R-URI-only.
ack_ip = ack.get('ip','')
next_hop_ok = '192.76.120.10' in ack_ip and '> 192.76.120.10' in ack_ip.replace(' ', '')
# tcpdump style: "172.31.x.x.5060 > 192.76.120.10.5060"
if '> 192.76.120.10' not in ack_ip and ' > 192.76.120.10' not in ack_ip:
    next_hop_ok = '192.76.120.10' in ack_ip.split('>')[-1] if '>' in ack_ip else False
else:
    next_hop_ok = True
print('=== RESULT ===')
print('carrier_200_OK: found')
print('post_200_ack: found')
print(f"ack_udp_next_hop: {ack_ip}")
print(f"ack_next_hop_telnyx_sbc: {'PASS' if next_hop_ok else 'FAIL — must be 192.76.120.10 (RFC3261 loose route / Asterisk ref)'}")
if not next_hop_ok:
    sys.exit(2)
PY
