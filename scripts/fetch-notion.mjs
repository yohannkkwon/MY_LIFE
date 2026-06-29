// fetch-notion.mjs — production sync. Runs in GitHub Actions on a schedule.
// Reads the MCAT Notion page tree via the official API and writes data/mcat.json.
// Auth: process.env.NOTION_TOKEN (a Notion internal integration token shared to
// the MCAT page). The browser never sees this — only the Action does.
import { Client } from '@notionhq/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSessions } from './normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_PAGE_ID = process.env.MCAT_PAGE_ID || '383ce5fa-d00e-8072-b4fa-d9499e11b8a7';
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

// ---- helpers ---------------------------------------------------------------
async function listChildren(blockId) {
  const out = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

const textOf = (rich) => (rich || []).map((r) => r.plain_text).join('');

function statusFromRich(rich) {
  const run = (rich || []).find((r) => /\d/.test(r.plain_text)) || (rich || [])[0];
  const color = (run && run.annotations && run.annotations.color) || 'default';
  if (color.includes('red')) return 'wrong';
  if (color.includes('blue')) return 'correct';
  return 'unmarked';
}

function parseQuestion(block, sectionType) {
  const rich = block.numbered_list_item.rich_text;
  const text = textOf(rich).replace(/\s+/g, ' ').trim();
  const idm = text.match(/^(\d+)/);
  if (!idm) return null; // empty numbered item
  const id = idm[1];
  const status = statusFromRich(rich);
  let rest = text.slice(idm[0].length).replace(/^[\s\-–—:]+/, '');
  let uworldAvgPct = null;
  const avgm = rest.match(/\[\s*(\d+)\s*%\s*\]/);
  if (avgm) { uworldAvgPct = parseInt(avgm[1], 10); rest = rest.replace(avgm[0], '').trim(); }
  let paren = null;
  const pm = rest.match(/\(([^)]*)\)\s*$/) || rest.match(/\(([^)]*)\)/);
  if (pm) { paren = pm[1].trim(); rest = rest.replace(pm[0], '').trim(); }
  const topic = rest.replace(/[\-–—\s]+$/, '').replace(/^[\-–—\s]+/, '').trim();
  return {
    id,
    topic,
    status,
    note: sectionType === 'cars' ? null : (paren || null),
    carsSkill: sectionType === 'cars' ? (paren || null) : null,
    uworldAvgPct,
  };
}

function sectionType(header) {
  const t = (header || '').toUpperCase();
  if (t.includes('CARS')) return 'cars';
  if (t.includes('BIO')) return 'bio_biochem';
  if (t.includes('ORGANIC') || t.includes('CHEM')) return 'gen_org_chem';
  if (t.includes('PHYS')) return 'physics';
  return 'other';
}

function parseDate(title, year) {
  const m = (title || '').match(/^([A-Za-z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo == null) return null;
  return year + '-' + String(mo + 1).padStart(2, '0') + '-' + String(parseInt(m[2], 10)).padStart(2, '0');
}

// Parse one daily page into a raw session (normalize.mjs cleans it afterwards).
async function parsePage(childBlock) {
  const title = childBlock.child_page.title;
  const year = new Date(childBlock.created_time).getUTCFullYear();
  const iso = parseDate(title, year);
  const isBreak = /break/i.test(title);
  const pageKind = iso ? (isBreak ? 'break' : 'session') : 'reference';
  const session = { pageId: childBlock.id, title, pageKind, isoDate: iso, isBreak, sections: [], ankiText: '' };
  if (pageKind === 'reference') return session;

  const blocks = await listChildren(childBlock.id);
  let current = null;
  const ankiBits = [];

  for (const b of blocks) {
    if (b.type === 'heading_1') {
      const header = textOf(b.heading_1.rich_text);
      if (current) session.sections.push(current);
      current = { type: sectionType(header), rawHeader: header, marginPct: null, scorePct: null, questions: [] };
      // toggle heading: question items live as children of the heading
      if (b.has_children) {
        const kids = await listChildren(b.id);
        for (const k of kids) {
          if (k.type === 'numbered_list_item') {
            const q = parseQuestion(k, current.type);
            if (q) current.questions.push(q);
          } else if (k.type === 'paragraph') {
            ankiBits.push(textOf(k.paragraph.rich_text));
          }
        }
      }
    } else if (b.type === 'numbered_list_item' && current) {
      // sibling pattern: items follow a non-toggle heading
      const q = parseQuestion(b, current.type);
      if (q) current.questions.push(q);
    } else if (b.type === 'paragraph') {
      ankiBits.push(textOf(b.paragraph.rich_text));
    } else if (b.type === 'callout') {
      ankiBits.push(textOf(b.callout.rich_text));
    }
  }
  if (current) session.sections.push(current);
  session.ankiText = ankiBits.join('\n');
  return session;
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error('ERROR: NOTION_TOKEN is not set. Add it as a repo secret (Settings → Secrets → Actions).');
    process.exit(1);
  }
  console.log('Fetching MCAT page tree from Notion…');
  const top = await listChildren(MAIN_PAGE_ID);
  const childPages = top.filter((b) => b.type === 'child_page');
  console.log(`Found ${childPages.length} child pages.`);

  const rawSessions = [];
  for (const cp of childPages) {
    try {
      const s = await parsePage(cp);
      rawSessions.push(s);
      console.log(`  · ${s.title} → ${s.pageKind}${s.sections.length ? ' (' + s.sections.length + ' sections)' : ''}`);
    } catch (e) {
      console.error(`  ! failed on "${cp.child_page?.title}":`, e.message);
    }
  }

  const sessions = normalizeSessions(rawSessions);
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'notion',
    mainPageId: MAIN_PAGE_ID,
    sessionCount: sessions.length,
    sessions,
  };
  const outPath = resolve(__dirname, '..', 'data', 'mcat.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${outPath} — ${sessions.length} sessions.`);
}

// pure helpers exported for unit testing without hitting the network
export { parseQuestion, statusFromRich, sectionType, parseDate };

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
