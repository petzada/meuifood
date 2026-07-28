#!/usr/bin/env node
/**
 * Scanner determinístico da verificação contínua de tickets.
 *
 * Uso:
 *   node scripts/verify/scan.mjs                 -> JSON do estado atual (stdout)
 *   node scripts/verify/scan.mjs record ...      -> grava resultado de um ticket no ledger
 *   node scripts/verify/scan.mjs summary         -> regenera verification/STATUS.md
 *
 * Não lê código-fonte semanticamente: só decide O QUE precisa ser verificado,
 * para que o orquestrador gaste contexto apenas com o que mudou.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const QUIET_SECONDS = Number(process.env.VERIFY_QUIET_SECONDS ?? 120);
// Reverificação de ticket já aprovado (detecção de regressão) espera este intervalo:
// enquanto o agente implementa o ticket seguinte ele toca arquivos compartilhados o tempo todo.
const REVERIFY_COOLDOWN_MIN = Number(process.env.VERIFY_REVERIFY_COOLDOWN_MIN ?? 45);
const MAX_HASH_BYTES = 2 * 1024 * 1024;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  }).trim();

const sha = (value) => createHash('sha256').update(value).digest('hex');
const abs = (rel) => path.join(root, rel.split('/').join(path.sep));

// ---------------------------------------------------------------- feature dir

function detectFeature(explicit) {
  const scratch = path.join(root, '.scratch');
  if (!existsSync(scratch)) throw new Error('.scratch não encontrado');
  const candidates = readdirSync(scratch).filter((d) =>
    existsSync(path.join(scratch, d, 'issues')),
  );
  if (explicit) {
    if (!candidates.includes(explicit)) throw new Error(`feature ${explicit} não encontrada`);
    return explicit;
  }
  if (candidates.length !== 1) {
    throw new Error(
      `esperava exatamente 1 feature em .scratch/, achei ${candidates.length}: ${candidates.join(', ')} — use --feature`,
    );
  }
  return candidates[0];
}

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const feature = detectFeature(flag('feature'));
const featureRel = `.scratch/${feature}`;
const issuesRel = `${featureRel}/issues`;
const verifyRel = `${featureRel}/verification`;
const reportsRel = `${verifyRel}/reports`;
const ledgerRel = `${verifyRel}/ledger.json`;
const statusRel = `${verifyRel}/STATUS.md`;
const stopRel = `${verifyRel}/STOP`;
const specRel = `${featureRel}/spec.md`;

mkdirSync(abs(reportsRel), { recursive: true });

// ------------------------------------------------------------------- tickets

function parseTicket(file) {
  const rel = `${issuesRel}/${file}`;
  const raw = readFileSync(abs(rel), 'utf8');
  const number = file.slice(0, 2);
  const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '');
  const title = (raw.match(/^#\s*(.+)$/m)?.[1] ?? slug).trim();
  const status = (raw.match(/^\*{0,2}Status:?\*{0,2}:?\s*(.+)$/mi)?.[1] ?? '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase();
  const blockedBy = (raw.match(/^\*{0,2}Blocked by:?\*{0,2}:?\s*(.+)$/mi)?.[1] ?? '')
    .replace(/\*/g, '')
    .trim();
  const boxes = raw.match(/^\s*-\s*\[( |x|X)\]/gm) ?? [];
  const checked = boxes.filter((b) => /\[[xX]\]/.test(b)).length;
  return {
    number,
    slug,
    title,
    file: rel,
    status,
    blockedBy,
    hash: sha(raw),
    checkboxes: { checked, total: boxes.length },
  };
}

const tickets = readdirSync(abs(issuesRel))
  .filter((f) => /^\d{2}-.+\.md$/.test(f))
  .sort()
  .map(parseTicket);

// ------------------------------------------------------------- repo snapshot

// Ferramental da própria verificação não conta como atividade de código: se contasse,
// escrever um relatório reagendaria a verificação de todo mundo.
const IGNORED_PREFIXES = [verifyRel, 'node_modules/', 'scripts/verify/', '.claude/'];

const trackedFiles = git(['ls-files', '-co', '--exclude-standard'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((p) => !IGNORED_PREFIXES.some((prefix) => p.startsWith(prefix)))
  .filter((p) => !p.includes('/node_modules/'));

let newestMtime = 0;
let newestFile = null;
const fileHashes = new Map();

for (const rel of trackedFiles) {
  const full = abs(rel);
  let st;
  try {
    st = statSync(full);
  } catch {
    continue;
  }
  if (!st.isFile()) continue;
  if (st.mtimeMs > newestMtime) {
    newestMtime = st.mtimeMs;
    newestFile = rel;
  }
  const digest =
    st.size > MAX_HASH_BYTES
      ? sha(`${rel}:${st.size}:${Math.round(st.mtimeMs)}`)
      : sha(readFileSync(full));
  fileHashes.set(rel, digest);
}

const fingerprintOf = (paths) => {
  const matching = paths?.length
    ? [...fileHashes.entries()].filter(([p]) =>
        paths.some((prefix) => p === prefix || p.startsWith(prefix.replace(/\/?$/, '/'))),
      )
    : [...fileHashes.entries()];
  return {
    hash: sha(
      matching
        .map(([p, h]) => `${p}:${h}`)
        .sort()
        .join('\n'),
    ),
    count: matching.length,
  };
};

const repoFingerprint = fingerprintOf(null);
const specHash = existsSync(abs(specRel)) ? sha(readFileSync(abs(specRel))) : 'no-spec';

// Decisão ou ADR novo pode invalidar uma verificação passada — como a 55 fez com a linha de
// migrations da 44. Entra na chave junto com a spec.
const docsHash = fingerprintOf(['docs/decisoes', 'docs/adr', 'CONTEXT.md']).hash;

const headSha = git(['rev-parse', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const dirtyCount = git(['status', '--porcelain']).split('\n').filter(Boolean).length;

const quietSeconds = newestMtime ? Math.round((Date.now() - newestMtime) / 1000) : 99999;
const gitLock = existsSync(path.join(root, '.git', 'index.lock'));

// --------------------------------------------------------------------- ledger

const emptyLedger = { version: 1, updatedAt: null, meta: { busySkips: 0 }, tickets: {} };
const readLedger = () => {
  if (!existsSync(abs(ledgerRel))) return structuredClone(emptyLedger);
  try {
    return JSON.parse(readFileSync(abs(ledgerRel), 'utf8'));
  } catch {
    return structuredClone(emptyLedger);
  }
};
const writeLedger = (ledger) => {
  ledger.updatedAt = new Date().toISOString();
  writeFileSync(abs(ledgerRel), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
};

// ------------------------------------------------------- sinais de conclusão

const OPEN_STATUSES = new Set([
  'ready-for-agent',
  'ready',
  'todo',
  'backlog',
  'blocked',
  'in-progress',
  'wip',
  'draft',
]);

const commitLog = git(['log', '--format=%s%n%b%n---', '-n', '400']).toLowerCase();

function signalsFor(t) {
  const tokens = t.slug.split('-');
  const shortSlug = tokens.slice(0, 2).join('-');
  // `Status:` é autoritativo: o agente de código o move de propósito e o devolve para
  // `ready-for-agent` quando reabre o ticket. Checkbox marcado durante a implementação
  // não vale como conclusão enquanto o Status disser o contrário.
  const statusOpen = t.status !== '' && OPEN_STATUSES.has(t.status);
  const statusDone = t.status !== '' && !OPEN_STATUSES.has(t.status);
  const checkboxesDone = t.checkboxes.total > 0 && t.checkboxes.checked === t.checkboxes.total;
  // Refs numéricas soltas (#7, [24]) são ambíguas neste repo — só padrões explícitos.
  const commitRef =
    new RegExp(`(ticket|issue|feat|fix)\\s*[(#:\\s-]*${t.number}\\b`, 'i').test(commitLog) ||
    commitLog.includes(t.slug) ||
    (shortSlug.length > 8 && commitLog.includes(shortSlug));
  // Branch com o slug significa "alguém está trabalhando nisso" — o oposto de concluído.
  const branchRef = shortSlug.length > 8 && branch.toLowerCase().includes(shortSlug);
  return { statusOpen, statusDone, checkboxesDone, commitRef, branchRef };
}

// ------------------------------------------------------------------ montagem

const ledger = readLedger();

const scanned = tickets.map((t) => {
  const signals = signalsFor(t);
  // Sem Status reconhecível, checkbox e commit funcionam como sinais de reserva.
  const implemented =
    signals.statusDone || (!signals.statusOpen && (signals.checkboxesDone || signals.commitRef));
  const entry = ledger.tickets?.[t.number] ?? null;
  const footprint = entry?.footprint ?? null;
  const scoped = fingerprintOf(footprint);
  const verificationKey = sha(`${t.hash}|${specHash}|${docsHash}|${scoped.hash}`);
  const changed = entry?.verificationKey !== verificationKey;
  const current = { ticket: t.hash, spec: specHash, docs: docsHash, scoped: scoped.hash };
  const changedParts = entry?.parts
    ? Object.keys(current).filter((k) => entry.parts[k] !== current[k])
    : null;
  const kind = entry ? 'regressao' : 'primeira';
  const minutesSince = entry?.lastVerifiedAt
    ? Math.round((Date.now() - Date.parse(entry.lastVerifiedAt)) / 60000)
    : Infinity;
  const cooled = kind === 'primeira' || minutesSince >= REVERIFY_COOLDOWN_MIN;
  const needsVerification = implemented && changed && cooled;

  const reason = !implemented
    ? signals.statusOpen
      ? `ticket aberto (Status: ${t.status})`
      : 'ticket ainda não sinalizado como concluído'
    : !entry
      ? 'nunca verificado'
      : !changed
        ? 'já verificado nesta versão'
        : cooled
          ? 'ticket, spec ou footprint mudaram desde a última verificação'
          : `regressão possível, mas em cooldown (${REVERIFY_COOLDOWN_MIN - minutesSince} min restantes)`;

  return {
    ...t,
    signals,
    implemented,
    scopedFiles: scoped.count,
    footprint,
    verificationKey,
    kind,
    changedParts,
    minutesSince: minutesSince === Infinity ? null : minutesSince,
    needsVerification,
    reason,
    ledger: entry
      ? {
          verdict: entry.verdict,
          openFindings: entry.openFindings,
          blockers: entry.blockers,
          lastVerifiedAt: entry.lastVerifiedAt,
          report: entry.report,
          runs: entry.runs,
        }
      : null,
  };
});

// Enquanto o ticket da branch atual estiver aberto, o código dos arquivos compartilhados está
// pela metade: caçar regressão ali produz achado sobre trabalho inacabado, não sobre regressão.
// Espera o ticket em voo fechar.
const activeTicket = scanned.find((t) => t.signals.branchRef && t.signals.statusOpen);
if (activeTicket) {
  for (const t of scanned) {
    if (t.needsVerification && t.kind === 'regressao') {
      t.needsVerification = false;
      t.reason = `regressão adiada: ticket ${activeTicket.number} em implementação nesta branch`;
    }
  }
}

// Verificação primária tem prioridade absoluta sobre caça a regressão: enquanto houver
// ticket novo esperando, reverificar aprovado só rouba a vez.
if (scanned.some((t) => t.needsVerification && t.kind === 'primeira')) {
  for (const t of scanned) {
    if (t.needsVerification && t.kind === 'regressao') {
      t.needsVerification = false;
      t.reason = 'regressão possível, aguardando as verificações primárias da fila';
    }
  }
}

// --------------------------------------------------------------- STATUS.md

const VERDICT_LABEL = {
  pass: '✅ conforme',
  findings: '⚠️ divergências',
  blocked: '⛔ bloqueado',
};

function renderStatus(state) {
  const rows = state.tickets.map((t) => {
    const v = t.ledger?.verdict ? (VERDICT_LABEL[t.ledger.verdict] ?? t.ledger.verdict) : '—';
    const when = t.ledger?.lastVerifiedAt ? t.ledger.lastVerifiedAt.slice(0, 16).replace('T', ' ') : '—';
    const report = t.ledger?.report ? `[relatório](${path.posix.relative(verifyRel, t.ledger.report)})` : '—';
    const impl = t.implemented ? 'sim' : 'não';
    const stale = t.needsVerification && t.ledger ? ' 🔄' : '';
    return `| ${t.number} | ${t.title.replace(/^\d+\s*—\s*/, '')} | ${impl} | ${v}${stale} | ${t.ledger?.openFindings ?? '—'} | ${t.ledger?.blockers ?? '—'} | ${when} | ${report} |`;
  });

  const pending = state.tickets.filter((t) => t.needsVerification);
  const totals = state.totals;

  return `# Verificação automática — ${feature}

_Atualizado em ${new Date().toISOString()} · branch \`${state.branch}\` · HEAD \`${state.headSha.slice(0, 8)}\`_

Relatórios gerados pelo loop de verificação (orquestrador Opus + verificadores Sonnet).
Cada relatório confronta a implementação com \`spec.md\`, o ticket, \`docs/decisoes/\` e \`docs/adr/\`.

- Tickets: **${totals.tickets}** · sinalizados como concluídos: **${totals.implemented}**
- Conformes: **${totals.pass}** · com divergências: **${totals.findings}** · na fila: **${totals.pending}**
- Bloqueadores abertos: **${totals.blockers}**

| # | Ticket | Impl. | Veredito | Abertos | Bloq. | Verificado em | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

🔄 = já verificado antes, mas o código/ticket mudou depois — está na fila para nova verificação.

${
  pending.length
    ? `## Na fila\n\n${pending.map((t) => `- \`${t.number}\` ${t.title} — ${t.reason}`).join('\n')}`
    : '## Na fila\n\nNada pendente.'
}

## Como parar o loop

Crie o arquivo \`${stopRel}\` (\`New-Item ${stopRel}\`) ou peça "pare o loop de verificação" no chat.
`;
}

// -------------------------------------------------------------------- output

const state = {
  generatedAt: new Date().toISOString(),
  feature,
  paths: {
    spec: specRel,
    issues: issuesRel,
    verification: verifyRel,
    reports: reportsRel,
    ledger: ledgerRel,
    status: statusRel,
  },
  branch,
  headSha,
  dirtyCount,
  repoFingerprint: repoFingerprint.hash.slice(0, 12),
  stopRequested: existsSync(abs(stopRel)),
  busy: {
    quietSeconds,
    threshold: QUIET_SECONDS,
    newestFile,
    gitLock,
    isBusy: gitLock || quietSeconds < QUIET_SECONDS,
    consecutiveSkips: ledger.meta?.busySkips ?? 0,
    // Depois de 3 adiamentos seguidos o agente de código pode estar em sessão
    // longa: verifica assim mesmo, marcando o relatório como snapshot instável.
    forceAllowed: (ledger.meta?.busySkips ?? 0) >= 3,
  },
  totals: {
    tickets: scanned.length,
    implemented: scanned.filter((t) => t.implemented).length,
    pending: scanned.filter((t) => t.needsVerification).length,
    pass: scanned.filter((t) => t.ledger?.verdict === 'pass' && !t.needsVerification).length,
    findings: scanned.filter((t) => t.ledger?.verdict === 'findings').length,
    blockers: scanned.reduce((acc, t) => acc + (t.ledger?.blockers ?? 0), 0),
  },
  tickets: scanned,
};

const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'scan';

if (command === 'record') {
  const number = String(flag('ticket', '')).padStart(2, '0');
  const target = scanned.find((t) => t.number === number);
  if (!target) throw new Error(`ticket ${number} não encontrado`);

  const footprint = (flag('footprint', '') || '')
    .split(',')
    .map((s) => s.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean);

  const scoped = fingerprintOf(footprint.length ? footprint : null);
  const previous = ledger.tickets[number] ?? { runs: 0 };
  ledger.meta = { ...(ledger.meta ?? {}), busySkips: 0 };

  ledger.tickets[number] = {
    slug: target.slug,
    verdict: flag('verdict', 'findings'),
    openFindings: Number(flag('open', 0)),
    blockers: Number(flag('blockers', 0)),
    report: flag('report', `${reportsRel}/${number}-${target.slug}.md`),
    footprint: footprint.length ? footprint : null,
    footprintFiles: scoped.count,
    verificationKey: sha(`${target.hash}|${specHash}|${docsHash}|${scoped.hash}`),
    // Guardado separado para o próximo ciclo saber *o que* invalidou a verificação e
    // decidir entre rechecagem focada e verificação completa.
    parts: { ticket: target.hash, spec: specHash, docs: docsHash, scoped: scoped.hash },
    headSha,
    lastVerifiedAt: new Date().toISOString(),
    runs: (previous.runs ?? 0) + 1,
    note: flag('note', '') || undefined,
  };

  writeLedger(ledger);
  process.stdout.write(
    `${JSON.stringify({ recorded: number, verdict: ledger.tickets[number].verdict, footprintFiles: scoped.count }, null, 2)}\n`,
  );
} else if (command === 'defer') {
  ledger.meta = { ...(ledger.meta ?? {}), busySkips: (ledger.meta?.busySkips ?? 0) + 1 };
  writeLedger(ledger);
  process.stdout.write(`${JSON.stringify({ busySkips: ledger.meta.busySkips }, null, 2)}\n`);
} else if (command === 'summary') {
  writeFileSync(abs(statusRel), renderStatus(state), 'utf8');
  process.stdout.write(`${statusRel} atualizado\n`);
} else {
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}
