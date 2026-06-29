/* mcat.js — MCAT dashboard organized around the 4 official MCAT sections. */
(function () {
  'use strict';
  const E = Charts.esc;
  const BB = 'var(--good)';      // Bio/Biochem
  const CP = 'var(--blue)';      // Chem/Phys
  const CARS = 'var(--accent)';  // CARS
  const PS = '#9b7cc4';          // Psych/Soc

  // The 4 MCAT sections, mapped to the section types found in the Notion log.
  const SECTIONS = [
    { key: 'cp', label: 'Chem/Phys', short: 'C/P', color: CP, types: ['gen_org_chem'], science: true },
    { key: 'cars', label: 'CARS', short: 'CARS', color: CARS, types: ['cars'], science: false },
    { key: 'bb', label: 'Bio/Biochem', short: 'B/B', color: BB, types: ['bio_biochem'], science: true },
    { key: 'ps', label: 'Psych/Soc', short: 'P/S', color: PS, types: ['psych_soc'], science: true },
  ];

  // ---------------------------------------------------------------- derive
  function derive(mcat, config) {
    const sessions = (mcat.sessions || []).slice().sort((a, b) => a.isoDate < b.isoDate ? -1 : 1);
    const dateLabels = sessions.map(s => DataLayer.shortDate(s.isoDate));
    const prioBio = new Set(config.topicPriority?.bio_biochem || []);
    const prioChem = new Set(config.topicPriority?.gen_org_chem || []);
    const isPriority = t => prioBio.has(t) || prioChem.has(t);

    // per-MCAT-section time series
    const sectionData = {};
    SECTIONS.forEach(sec => {
      const pts = sessions.map(s => {
        const m = s.sections.find(x => sec.types.includes(x.type));
        return { date: s.isoDate, score: m && m.scorePct != null ? m.scorePct : null, margin: m ? m.marginPct : null, provider: m ? m.provider : null };
      });
      const scored = pts.filter(p => p.score != null);
      // CARS uses day-over-day delta (AAMC gives no peer average)
      scored.forEach((p, i) => { p.delta = i > 0 ? p.score - scored[i - 1].score : null; });
      sectionData[sec.key] = { ...sec, pts, scored, latest: scored[scored.length - 1] || null };
    });

    // CARS rows for the table (most recent first), with computed delta
    const cars = sectionData.cars.scored.slice().reverse().map(p => ({ date: p.date, provider: p.provider, score: p.score, delta: p.delta }));

    // weak topics (science): flagged = not-correct; wrong = confirmed red
    const topics = new Map();
    sessions.forEach(s => s.sections.forEach(sec => {
      if (sec.type !== 'bio_biochem' && sec.type !== 'gen_org_chem') return;
      sec.questions.forEach(q => {
        if (q.status === 'correct' || !q.topic) return;
        const t = topics.get(q.topic) || { topic: q.topic, flagged: 0, wrong: 0, subject: sec.type };
        t.flagged++; if (q.status === 'wrong') t.wrong++;
        topics.set(q.topic, t);
      });
    }));
    const weak = [...topics.values()].sort((a, b) => b.flagged - a.flagged);

    // all questions grouped by topic (for the question log)
    const groups = new Map();
    sessions.forEach(s => s.sections.forEach(sec => {
      sec.questions.forEach(q => {
        const topic = q.topic || (sec.type === 'physics' ? 'Physics' : sec.type === 'cars' ? 'CARS' : 'Other');
        const g = groups.get(topic) || { topic, subject: sec.type, items: new Map(), wrong: 0, correct: 0 };
        if (!g.items.has(q.id)) {
          g.items.set(q.id, { id: q.id, status: q.status, idSuspect: q.idSuspect });
          if (q.status === 'wrong') g.wrong++; else if (q.status === 'correct') g.correct++;
        }
        groups.set(topic, g);
      });
    }));
    const questionGroups = [...groups.values()]
      .map(g => ({ ...g, items: [...g.items.values()], total: g.items.size }))
      .sort((a, b) => {
        const ap = isPriority(a.topic) ? 1 : 0, bp = isPriority(b.topic) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return b.wrong - a.wrong || b.total - a.total;
      });

    const anki = sessions.filter(s => s.anki).map(s => ({ date: s.isoDate, ...s.anki }));
    const flaggedIds = [];
    sessions.forEach(s => s.sections.forEach(sec => sec.questions.forEach(q => { if (q.idSuspect) flaggedIds.push(q.id); })));

    return { sessions, dateLabels, sectionData, cars, weak, questionGroups, anki, flaggedIds, isPriority };
  }

  // ---------------------------------------------------------------- render
  function render(root, data) {
    const { mcat, config } = data;
    if (!mcat || !mcat.sessions || !mcat.sessions.length) { root.innerHTML = emptyState(); return; }
    const d = derive(mcat, config);
    const days = DataLayer.daysBetween(DataLayer.todayISO(), config.examDate);

    root.innerHTML = `
      <div class="page-head" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <h1 style="margin:0">MCAT</h1>
        <span class="exam-badge">🎯 <b>${config.targetScore}+</b> · ${DataLayer.prettyDate(config.examDate)} 2026 · <b>${days}</b> days left</span>
      </div>
      <div class="dash">
        ${kpiRow(d)}
        ${sectionHistoryCard(d, config)}
        ${weakTopicsCard(d)}
        ${questionLogCard(d)}
        ${ankiCard(d)}
        ${dataNotes(d, mcat)}
      </div>`;

    wireSectionTabs(root, d, config);
    wireQuestionLog(root);
  }

  // KPI row: one card per MCAT section, latest score
  function kpiRow(d) {
    const cards = SECTIONS.map(sec => {
      const sd = d.sectionData[sec.key];
      const latest = sd.latest;
      if (!latest) {
        return `<div class="card kpi">
          <span class="kpi-label">${sec.label}</span>
          <span class="kpi-value" style="color:var(--text-faint)">—</span>
          <span class="kpi-foot">not started yet</span>
        </div>`;
      }
      let pill = '';
      if (sec.key === 'cars') {
        if (latest.delta != null) pill = `<span class="pill ${latest.delta >= 0 ? 'up' : 'down'}">${latest.delta >= 0 ? '▲' : '▼'} ${Math.abs(latest.delta)} vs last</span>`;
      } else if (latest.margin != null) {
        pill = `<span class="pill ${latest.margin >= 0 ? 'up' : 'down'}">${latest.margin >= 0 ? '+' : ''}${latest.margin}% vs avg</span>`;
      }
      const provider = latest.provider || (sec.science ? 'UWorld' : '');
      return `<div class="card kpi" style="--kc:${sec.color}">
        <span class="kpi-label">${sec.label}</span>
        <span class="kpi-value" style="color:${sec.color}">${latest.score}<span class="unit">%</span></span>
        <span class="kpi-foot">${provider ? E(provider) + ' · ' : ''}${DataLayer.prettyDate(latest.date)} ${pill}</span>
        ${Charts.spark(sd.scored.map(p => p.score), { color: sec.color })}
      </div>`;
    }).join('');
    return `<div class="grid kpi-row">${cards}</div>`;
  }

  // Section score history with 4 section tabs
  function sectionHistoryCard(d, config) {
    const tabs = SECTIONS.map((s, i) =>
      `<button class="tab sec-tab" data-key="${s.key}" aria-selected="${i === 0}">${s.short}</button>`).join('');
    return `<div class="card" id="sectionCard">
      <div class="card-head">
        <div><h3>Section score history</h3><div class="sub">by MCAT section, over time</div></div>
      </div>
      <div class="subtabs">${tabs}</div>
      <div id="sectionBody">${sectionBody(d, config, SECTIONS[0].key)}</div>
    </div>`;
  }
  function sectionBody(d, config, key) {
    const sec = SECTIONS.find(s => s.key === key);
    const sd = d.sectionData[key];
    if (!sd.scored.length) {
      return `<div class="empty">No ${sec.label} scores logged yet.${key === 'ps' ? '<br>Add a Psych/Soc section to your Notion day-pages and it\'ll show up here.' : ''}</div>`;
    }
    const values = sd.pts.map(p => p.score);
    const chart = Charts.line({ xLabels: d.dateLabels, series: [{ name: sec.label, color: sec.color, values }], yUnit: '%', connectNulls: true });
    let extra = '';
    if (key === 'cars') {
      const rows = d.cars.map(c => `<tr>
        <td>${DataLayer.prettyDate(c.date)}</td>
        <td>${c.provider ? E(c.provider) : '<span class="muted">—</span>'}</td>
        <td class="num">${c.score}%</td>
        <td>${c.delta == null ? '<span class="muted">—</span>' : `<span class="pill ${c.delta >= 0 ? 'up' : 'down'}">${c.delta >= 0 ? '+' : ''}${c.delta}</span>`}</td>
      </tr>`).join('');
      extra = `
        <div class="callout" style="margin:16px 0 12px"><span class="ic">💡</span><div>${E(config.carsNote)}</div></div>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Date</th><th>Source</th><th>Score</th><th>Δ vs last</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`;
    }
    return `<div class="chart">${chart}</div>${extra}`;
  }
  function wireSectionTabs(root, d, config) {
    const card = root.querySelector('#sectionCard');
    if (!card) return;
    card.querySelectorAll('.sec-tab').forEach(btn => btn.addEventListener('click', () => {
      card.querySelectorAll('.sec-tab').forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      card.querySelector('#sectionBody').innerHTML = sectionBody(d, config, btn.dataset.key);
    }));
  }

  // Weak topics — HTML bars, full width, readable
  function weakTopicsCard(d) {
    const top = d.weak.slice(0, 12);
    const max = Math.max(1, ...top.map(t => t.flagged));
    const rows = top.map(t => {
      const color = t.subject === 'bio_biochem' ? BB : CP;
      const prio = d.isPriority(t.topic);
      return `<div class="weakrow" data-tip-title="${E(t.topic)}" data-tip="<b>${t.flagged}</b> flagged · <b>${t.wrong}</b> confirmed wrong${prio ? '<br>★ priority focus topic' : ''}">
        <div class="weaktopic ${prio ? 'prio' : ''}">${prio ? '★ ' : ''}${E(t.topic)}</div>
        <div class="weakbar"><div class="weakfill" style="width:${(t.flagged / max * 100).toFixed(0)}%;background:${color}"></div></div>
        <div class="weakcount">${t.flagged}</div>
      </div>`;
    }).join('');
    return `<div class="card">
      <div class="card-head">
        <div><h3>Weak topics by frequency</h3><div class="sub">questions logged for review (excl. confirmed-correct)</div></div>
        <div class="legend">
          <span><i class="swatch" style="background:${BB}"></i>Bio/Biochem</span>
          <span><i class="swatch" style="background:${CP}"></i>Chem/Phys</span>
          <span>★ priority</span>
        </div>
      </div>
      <div class="weak-list">${rows}</div>
    </div>`;
  }

  // Question log — every question from Notion, grouped by topic, red/blue
  function questionLogCard(d) {
    const total = d.questionGroups.reduce((a, g) => a + g.total, 0);
    const html = d.questionGroups.map((g, i) => {
      const chips = g.items.map(q =>
        `<span class="qchip ${q.status}" data-id="${q.id}" data-tip="${E(g.topic)} · ${q.status}${q.idSuspect ? '<br>⚠ check this ID in Notion' : ''}">${q.id}</span>`
      ).join('');
      return `<details class="qgroup" ${i < 3 ? 'open' : ''}>
        <summary>${d.isPriority(g.topic) ? '<i class="legend-dot" style="background:var(--accent)"></i>' : ''}${E(g.topic)}
          <span class="qcounts">
            ${g.wrong ? `<span class="qc-wrong">${g.wrong} wrong</span>` : ''}
            ${g.correct ? `<span class="qc-correct">${g.correct} correct</span>` : ''}
            <span class="muted">${g.total} total</span>
          </span>
        </summary>
        <div class="qchips">${chips}</div>
      </details>`;
    }).join('');
    return `<div class="card" id="qlogCard">
      <div class="card-head">
        <div><h3>Question log by topic</h3><div class="sub">every question from your Notion · click an ID to mark it redone (saved locally)</div></div>
        <div class="legend">
          <span><i class="swatch" style="background:var(--bad)"></i>wrong</span>
          <span><i class="swatch" style="background:var(--blue)"></i>correct</span>
          <span><i class="swatch" style="background:var(--border-strong)"></i>unmarked</span>
        </div>
      </div>
      <p class="muted" style="margin:0 0 14px">${total} questions across ${d.questionGroups.length} topics.</p>
      ${html}
    </div>`;
  }
  function wireQuestionLog(root) {
    const card = root.querySelector('#qlogCard');
    if (!card) return;
    const KEY = 'mcat.redo.done';
    const done = DataLayer.getChecked(KEY);
    const apply = () => card.querySelectorAll('.qchip').forEach(el => el.classList.toggle('done', done.has(el.dataset.id)));
    card.querySelectorAll('.qchip').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (done.has(id)) done.delete(id); else done.add(id);
      DataLayer.setChecked(KEY, done);
      apply();
    }));
    apply();
  }

  // Anki — raw numbers, no target
  function ankiCard(d) {
    if (!d.anki.length) {
      return `<div class="card"><div class="card-head"><h3>Anki</h3></div>
        <div class="empty">No Anki sessions logged yet.<br>Add “Anki: Studied N cards in M minutes” to a Notion day page.</div></div>`;
    }
    const latest = d.anki[d.anki.length - 1];
    const total = d.anki.reduce((a, x) => a + x.cards, 0);
    const totalMin = d.anki.reduce((a, x) => a + x.minutes, 0);
    const secPer = (latest.minutes * 60 / latest.cards).toFixed(1);
    return `<div class="card">
      <div class="card-head"><div><h3>Anki</h3><div class="sub">most recent: ${DataLayer.prettyDate(latest.date)}</div></div></div>
      <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:baseline">
        <div><div class="kpi-value" style="font-size:40px">${latest.cards.toLocaleString()}</div><div class="kpi-foot">cards reviewed</div></div>
        <div><div class="kpi-value" style="font-size:40px">${latest.minutes}<span class="unit">min</span></div><div class="kpi-foot">${secPer}s / card</div></div>
        <div><div class="kpi-value" style="font-size:40px">${total.toLocaleString()}</div><div class="kpi-foot">total over ${d.anki.length} day${d.anki.length > 1 ? 's' : ''} (${Math.round(totalMin / 60)}h)</div></div>
        ${d.anki.length > 1 ? `<div style="flex:1;min-width:120px;align-self:center">${Charts.spark(d.anki.map(a => a.cards), { color: CARS })}</div>` : ''}
      </div>
    </div>`;
  }

  function dataNotes(d, mcat) {
    const parts = [];
    if (d.flaggedIds.length) parts.push(`⚠ ${d.flaggedIds.length} question ID${d.flaggedIds.length > 1 ? 's' : ''} look mistyped in Notion (${d.flaggedIds.map(E).join(', ')}) — fix there and they'll self-correct.`);
    const stamp = mcat.generatedAt ? new Date(mcat.generatedAt).toLocaleString() : '';
    parts.push(`Synced from Notion${stamp ? ' · ' + stamp : ''} · ${mcat.sessions.length} sessions.`);
    return `<p class="muted">${parts.join(' &nbsp;·&nbsp; ')}</p>`;
  }

  function emptyState() {
    return `<div class="page-head"><h1>MCAT</h1></div>
      <div class="card"><div class="empty">No MCAT data found yet.<br>
      Add your <code>NOTION_TOKEN</code> secret and run the <b>Sync MCAT data</b> GitHub Action.</div></div>`;
  }

  window.MCAT = { render };
})();
