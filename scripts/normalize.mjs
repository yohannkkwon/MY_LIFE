// normalize.mjs — shared cleaning logic for MCAT Notion data.
// Imported by both bootstrap.mjs (one-time snapshot from the parse workflow)
// and fetch-notion.mjs (daily GitHub Action). Keeping the rules here means the
// initial commit and every future sync produce an identical, clean schema.

// ---- Topic name canonicalization -------------------------------------------
// The Notion log spells some topics inconsistently across days. Map every known
// variant to one canonical form so topic grouping doesn't fragment.
const TOPIC_CANON = new Map([
  ['endocrine and nervous system', 'Endocrine and Nervous Systems'],
  ['endocrine and nervous systems', 'Endocrine and Nervous Systems'],
  ['introduction of organic chemistry', 'Introduction to Organic Chemistry'],
  ['introduction to organic chemistry', 'Introduction to Organic Chemistry'],
  ['thermodynamics, kinetics & gas law', 'Thermodynamics, Kinetics & Gas Laws'],
  ['thermodynamics, kinetics & gas laws', 'Thermodynamics, Kinetics & Gas Laws'],
]);

export function canonTopic(topic) {
  if (!topic) return '';
  const t = String(topic).trim().replace(/\s+/g, ' ');
  return TOPIC_CANON.get(t.toLowerCase()) || t;
}

// ---- CARS skill canonicalization -------------------------------------------
export function canonCarsSkill(skill) {
  if (!skill) return null;
  let s = String(skill).trim();
  s = s.replace(/^[([\s]+/, '');                    // strip stray leading "(" "["
  s = s.replace(/\bExtend of Passage Evidence\b/i, 'Extent of Passage Evidence');
  s = s.replace(/Research and Design/i, 'Research Design');
  s = s.replace(/\s+/g, ' ').trim();
  return s || null;
}

// ---- Score header parsing (sign rule) --------------------------------------
// Header score is encoded a few ways across days:
//   "(+12%) - 71%"  -> margin +12, score 71
//   "(+9%)"         -> margin +9,  score null
//   "(73%)"         -> score 73,   margin null   (lone %, no sign = absolute score)
//   "(68%) - (-5%)" -> score 68,   margin -5
// RULE: a percentage token WITH an explicit +/- sign is a margin; WITHOUT a sign
// it is an absolute score.
export function stripHeader(raw) {
  return String(raw || '')
    .replace(/<[^>]*>/g, '')           // strip span/html tags
    .replace(/\{[^}]*\}/g, '')         // strip {toggle="true"}
    .replace(/^#+\s*/, '')             // strip leading markdown "# "
    .trim();
}

export function parseScore(rawHeader) {
  const text = stripHeader(rawHeader);
  const tokens = [...text.matchAll(/([+-]?)(\d+(?:\.\d+)?)\s*%/g)];
  let marginPct = null;
  let scorePct = null;
  for (const m of tokens) {
    const signed = m[1] === '+' || m[1] === '-';
    const val = (m[1] === '-' ? -1 : 1) * parseFloat(m[2]);
    if (signed) {
      if (marginPct === null) marginPct = val;
    } else {
      if (scorePct === null) scorePct = Math.abs(val);
    }
  }
  return { marginPct, scorePct };
}

// ---- Section metadata ------------------------------------------------------
const SECTION_LABEL = {
  bio_biochem: 'Bio/Biochem',
  gen_org_chem: 'Gen/Org Chem',
  cars: 'CARS',
  physics: 'Physics',
  other: 'Other',
};
export function sectionLabel(type) { return SECTION_LABEL[type] || 'Other'; }

export function providerOf(rawHeader) {
  const t = stripHeader(rawHeader).toLowerCase();
  if (t.includes('jack westin')) return 'Jack Westin';
  if (t.includes('aamc')) return 'AAMC';
  if (t.includes('uworld')) return 'UWorld';
  return null;
}

// ---- Question id sanity ----------------------------------------------------
// Real UWorld ids are 6 digits beginning "40". Flag anything else (e.g. the
// 5-digit "40165" or 49-prefixed "491282") WITHOUT changing it, so the user can
// fix it in Notion and it self-corrects on the next sync.
export function isIdSuspect(id) {
  return !/^40\d{4}$/.test(String(id || '').trim());
}

// ---- Anki extraction -------------------------------------------------------
// Reads a free-text line like "Anki: Studied 1387 cards in 127 minutes".
export function extractAnki(text) {
  if (!text) return null;
  const m = String(text).match(/Anki[^.]*?Studied\s+([\d,]+)\s+cards?\s+in\s+(\d+)\s*min/i);
  if (!m) return null;
  return { cards: parseInt(m[1].replace(/,/g, ''), 10), minutes: parseInt(m[2], 10) };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekdayOf(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? null : WEEKDAYS[d.getUTCDay()];
}

// ---- Top-level normalizer --------------------------------------------------
// Input: raw session objects (shape produced by the parse workflow OR the Notion
// API parser). Output: clean, sorted sessions for data/mcat.json.
export function normalizeSessions(rawSessions) {
  const sessions = (rawSessions || [])
    .filter((s) => s && (s.pageKind === 'session' || s.pageKind === 'break' || s.isBreak))
    .filter((s) => s.isoDate) // dated pages only (drops the "Physics and Math" reference index)
    .map((s) => {
      const anki = extractAnki(s.ankiText || s.notes || s.ankiNote || '');
      const sections = (s.sections || []).map((sec) => {
        const derived = parseScore(sec.rawHeader);
        const marginPct = derived.marginPct !== null ? derived.marginPct
          : (typeof sec.marginPct === 'number' ? sec.marginPct : null);
        const scorePct = derived.scorePct !== null ? derived.scorePct
          : (typeof sec.scorePct === 'number' ? sec.scorePct : null);
        const questions = (sec.questions || [])
          .filter((q) => q && q.id != null && String(q.id).trim() !== '')
          .map((q) => ({
            id: String(q.id).trim(),
            topic: canonTopic(q.topic),
            status: q.status || 'unmarked',
            note: q.note || null,
            uworldAvgPct: typeof q.uworldAvgPct === 'number' ? q.uworldAvgPct : null,
            carsSkill: sec.type === 'cars' ? canonCarsSkill(q.carsSkill) : null,
            idSuspect: isIdSuspect(q.id),
          }));
        return {
          type: sec.type || 'other',
          label: sectionLabel(sec.type),
          provider: providerOf(sec.rawHeader),
          rawHeader: stripHeader(sec.rawHeader),
          marginPct,
          scorePct,
          questions,
        };
      });
      return {
        date: s.title || s.date || s.isoDate,
        isoDate: s.isoDate,
        weekday: weekdayOf(s.isoDate),
        isBreak: !!s.isBreak || s.pageKind === 'break',
        anki,
        sections,
      };
    });
  sessions.sort((a, b) => (a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : 0));
  return sessions;
}
