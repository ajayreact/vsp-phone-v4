#!/usr/bin/env node
'use strict';

/**
 * Assemble the RC1 Phase-5 runtime-evidence report from the raw outputs of
 * the other platform scripts. Pure text stitching — no inference, no
 * fabricated data. Any section whose input file is missing is marked
 * "NOT CAPTURED" rather than guessed.
 *
 * Usage:
 *   node scripts/platform/generate-rc1-report.cjs \
 *     --extension 100 \
 *     --call-type outbound \
 *     --registrar-before <file>   # `show-registrar-contacts.sh` output, captured BEFORE Zoiper registers
 *     --registrar-after  <file>   # same script, captured AFTER Zoiper reports REGISTERED
 *     --ladder           <file>   # stdout of build-sip-ladder.cjs for this call
 *     --rtp-during       <file>   # stdout of query-rtpengine-call-stats.cjs query <call-id>, taken mid-call
 *     --rtp-after        <file>   # same command, taken a few seconds after BYE
 *     --out              <file>   # where to write the markdown report (default: stdout)
 */

const fs = require('node:fs');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function readOrNull(path) {
  if (!path) return null;
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function section(title, body) {
  return `## ${title}\n\n${body && body.trim() ? body.trim() : '_NOT CAPTURED — no input file provided or file was empty._'}\n`;
}

function countContacts(text) {
  if (!text) return null;
  const m = text.match(/^\s*Contact:/gim);
  return m ? m.length : 0;
}

function extractBetween(text, startRe, endRe) {
  if (!text) return null;
  const startIdx = text.search(startRe);
  if (startIdx === -1) return null;
  const rest = text.slice(startIdx);
  const endIdx = rest.search(endRe);
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

function extractApiLines(ladderText) {
  if (!ladderText) return null;
  const lines = ladderText.split('\n').filter((l) => /\[API\]/.test(l));
  return lines.length ? lines.join('\n') : null;
}

function summarizeRtp(text, label) {
  if (!text) return `${label}: NOT CAPTURED`;
  if (/RTPengine returned an error/i.test(text)) {
    const reasonMatch = text.match(/RTPengine returned an error: (.+)/);
    return `${label}: RTPengine has NO session for this call-id (${reasonMatch ? reasonMatch[1] : 'unknown reason'}).`;
  }
  const summaryMatch = text.match(/(\d+) of (\d+) stream\(s\) show packets>0\.[^\n]*/);
  const counterLines = text.match(/\$\.[^\n]*: packets=\d+[^\n]*/g) || [];
  return [
    `${label}: RTPengine has an active session for this call-id.`,
    ...counterLines.map((l) => `  - ${l.trim()}`),
    summaryMatch ? `  - ${summaryMatch[0]}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const extension = args.extension || '(unspecified)';
  const callType = args['call-type'] || '(unspecified)';

  const registrarBefore = readOrNull(args['registrar-before']);
  const registrarAfter = readOrNull(args['registrar-after']);
  const ladder = readOrNull(args.ladder);
  const rtpDuring = readOrNull(args['rtp-during']);
  const rtpAfter = readOrNull(args['rtp-after']);

  const contactsBefore = countContacts(registrarBefore);
  const contactsAfter = countContacts(registrarAfter);

  const milestoneBlock = extractBetween(ladder, /=== Milestone checklist ===/, /=== First failing stage/);
  const firstFailingBlock = extractBetween(ladder, /=== First failing stage[^\n]*===/, /=== Mermaid/);
  const mermaidBlock = extractBetween(ladder, /```mermaid/, /```\s*$/);
  const apiRoutingLines = extractApiLines(ladder);

  const failureDetected = firstFailingBlock && !/All checked milestones present/.test(firstFailingBlock);
  let responsibleComponent = 'Undetermined — insufficient evidence';
  if (firstFailingBlock) {
    const m = firstFailingBlock.match(/Responsible component:\s*(.+)/);
    if (m) responsibleComponent = m[1].trim();
    else if (!failureDetected) responsibleComponent = 'None — no failing stage detected in this capture';
  }

  const rtpOrphanCheck =
    rtpAfter && /RTPengine returned an error/i.test(rtpAfter)
      ? 'PASS — RTPengine has no lingering session for this call-id after BYE (no orphaned session).'
      : rtpAfter
        ? 'FAIL / INCONCLUSIVE — RTPengine still reports a session for this call-id after BYE. Investigate potential orphaned RTP session / missing delete on teardown.'
        : 'NOT CAPTURED — no post-BYE RTPengine query was provided.';

  const lines = [];
  lines.push(`# RC1 Core Telephony Validation Report`);
  lines.push('');
  lines.push(`- Extension under test: **${extension}**`);
  lines.push(`- Call type: **${callType}**`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Evidence sources: registrar dumps (Kamailio usrloc), merged Kamailio+API+RTPengine capture, RTPengine NG queries. No inference — sections marked NOT CAPTURED had no input file.`);
  lines.push('');

  lines.push(
    section(
      '1. Registrar state — BEFORE Zoiper registration',
      registrarBefore ? `Contacts found: ${contactsBefore}\n\n\`\`\`\n${registrarBefore.trim()}\n\`\`\`` : null,
    ),
  );
  lines.push(
    section(
      '2. Registrar state — AFTER Zoiper registration',
      registrarAfter
        ? `Contacts found: ${contactsAfter}${
            contactsBefore !== null && contactsAfter !== null
              ? contactsAfter > contactsBefore
                ? ` (increased from ${contactsBefore} — new contact added, existing contact(s) preserved)`
                : contactsAfter === contactsBefore
                  ? ` (unchanged from before — Zoiper contact may not have registered, or replaced an existing contact instead of adding one; inspect below)`
                  : ` (DECREASED from ${contactsBefore} — an existing registration may have been displaced; inspect below)`
              : ''
          }\n\n\`\`\`\n${registrarAfter.trim()}\n\`\`\``
        : null,
    ),
  );
  lines.push(section('3. SIP Ladder', ladder ? `\`\`\`\n${ladder.trim()}\n\`\`\`` : null));
  lines.push(
    section(
      '4. Routing Timeline (API / RoutingService log lines only, chronological)',
      apiRoutingLines ? `\`\`\`\n${apiRoutingLines}\n\`\`\`` : null,
    ),
  );
  lines.push(
    section(
      '5. RTP Summary',
      `${summarizeRtp(rtpDuring, 'During call')}\n\n${summarizeRtp(rtpAfter, 'After BYE')}\n\nOrphaned-session check: ${rtpOrphanCheck}`,
    ),
  );
  lines.push(
    section(
      '6. Packet Flow (raw NG query responses)',
      `${rtpDuring ? `### During call\n\n\`\`\`\n${rtpDuring.trim()}\n\`\`\`\n` : ''}${rtpAfter ? `\n### After BYE\n\n\`\`\`\n${rtpAfter.trim()}\n\`\`\`` : ''}`,
    ),
  );
  lines.push(section('7. First Failing Stage', firstFailingBlock ? firstFailingBlock.trim() : milestoneBlock ? 'No explicit failing stage found — see milestone checklist below.' : null));
  if (milestoneBlock) {
    lines.push(section('7a. Milestone Checklist (for reference)', `\`\`\`\n${milestoneBlock.trim()}\n\`\`\``));
  }
  lines.push(
    section(
      '8. Root Cause (evidence-supported only)',
      failureDetected
        ? `${firstFailingBlock.trim()}\n\nSee Section 3 (SIP Ladder) and Section 4 (Routing Timeline) above for the exact log lines supporting this conclusion.`
        : ladder
          ? 'No failure detected in this capture. All checked milestones present; see Section 3/7a for the underlying evidence.'
          : null,
    ),
  );
  lines.push(section('9. Component Responsible', responsibleComponent));
  if (mermaidBlock) {
    lines.push(section('Appendix: Mermaid Sequence Diagram', `\`\`\`mermaid${mermaidBlock}\`\`\``));
  }

  const report = lines.join('\n');
  if (args.out) {
    fs.writeFileSync(args.out, report, 'utf8');
    console.log(`Report written to ${args.out}`);
  } else {
    console.log(report);
  }
}

main();
