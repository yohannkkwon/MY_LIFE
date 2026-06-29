// bootstrap.mjs — one-time: turn the parse-workflow output into data/mcat.json.
// Usage: node scripts/bootstrap.mjs <path-to-workflow-output.json>
// The production path (scripts/fetch-notion.mjs) replaces this on every sync;
// this just seeds the repo so the site has data before the first Action run.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSessions } from './normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2];
if (!inPath) { console.error('Usage: node scripts/bootstrap.mjs <workflow-output.json>'); process.exit(1); }

const raw = JSON.parse(readFileSync(inPath, 'utf8'));
const result = raw.result || raw;
const rawSessions = result.sessions || [];
const anomalies = (result.audit && result.audit.anomalies) || [];

const sessions = normalizeSessions(rawSessions);

const out = {
  generatedAt: new Date().toISOString(),
  source: 'notion',
  mainPageId: '383ce5fa-d00e-8072-b4fa-d9499e11b8a7',
  sessionCount: sessions.length,
  sessions,
  anomalies,
};

const outPath = resolve(__dirname, '..', 'data', 'mcat.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(`  sessions: ${sessions.length}`);
console.log(`  anomalies flagged: ${anomalies.length}`);
const flagged = sessions.flatMap((s) => s.sections.flatMap((sec) => sec.questions.filter((q) => q.idSuspect).map((q) => `${s.date}:${q.id}`)));
if (flagged.length) console.log(`  suspect ids: ${flagged.join(', ')}`);
