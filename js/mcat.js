/* mcat.js — render the MCAT dashboard from data/mcat.json + data/mcat-config.json */
(function () {
  'use strict';
  const E = Charts.esc;
  const BIO = 'var(--good)', CHEM = 'var(--blue)', CARS = 'var(--accent)';

  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------------------------------------------------------------- derive
  function derive(mcat, config) {
    const sessions = (mcat.sessions || []).slice().sort((a, b) => a.isoDate < b.isoDate ? -1 : 1);
    const byDate = new Map(sessions.map(s => [s.isoDate, s]));
    const prioBio = new Set((config.topicPriority?.bio_biochem || []));
    const prioChem = new Set((config.topicPriority?.gen_org_chem || []));
    const isPriority = t => prioBio.has(t) || prioChem.has(t);

    // streak: walk back from most recent logged day; sessions count, breaks bridge
    let streak = 0, studyStreak = true;
    if (sessions.length) {
      let cur = sessions[sessions.length - 1].isoDate;
      while (byDate.has(cur)) {
        if (!byDate.get(cur).isBreak) streak++;
        cur = addDays(cur, -1);
      }
    }

    // science sections
    const sci = [];
    sessions.forEach(s => s.sections.forEach(sec => {
      if (sec.type === 'bio_biochem' || sec.type === 'gen_org_chem') sci.push({ date: s.isoDate, sec });
    }));
    const sciScores = sci.filter(x => x.sec.scorePct != null).map(x => x.sec.scorePct);
    const avgScience = sciScores.length ? Math.round(sciScores.reduce((a, b) => a + b, 0) / sciScores.length) : null;

    // CARS history
    const cars = [];
    sessions.forEach(s => s.sections.forEach(sec => {
      if (sec.type === 'cars') cars.push({ date: s.isoDate, provider: sec.provider, score: sec.scorePct, margin: sec.marginPct });
    }));
    const carsScored = cars.filter(c => c.score != null);
    const latestCars = carsScored.length ? carsScored[carsScored.length - 1] : null;
    const prevCars = carsScored.length > 1 ? carsScored[carsScored.length - 2] : null;

    // weak topics (science): flagged = not-correct; wrong = confirmed red
    const topics = new Map();
    sci.forEach(({ sec }) => sec.questions.forEach(q => {
      if (q.status === 'correct') return;
      const t = topics.get(q.topic) || { topic: q.topic, flagged: 0, wrong: 0, subject: sec.type };
      t.flagged++; if (q.status === 'wrong') t.wrong++;
      topics.set(q.topic, t);
    }));
    const weak = [...topics.values()].filter(t => t.topic).sort((a, b) => b.flagged - a.flagged);

    // question index for redo cross-reference
    const qIndex = new Map();
    sessions.forEach(s => s.sections.forEach(sec => sec.questions.forEach(q => {
      const e = qIndex.get(q.id) || { id: q.id, topic: q.topic, dates: [], uworldAvgPct: null, status: q.status, idSuspect: q.idSuspect };
      e.dates.push(s.isoDate);
      if (q.uworldAvgPct != null) e.uworldAvgPct = q.uworldAvgPct;
      qIndex.set(q.id, e);
    })));

    // anki
    const anki = sessions.filter(s => s.anki).map(s => ({ date: s.isoDate, ...s.anki }));

    // recent misses (live freshness): latest study session's wrong/flagged
    const lastStudy = [...sessions].reverse().find(s => !s.isBreak && s.sections.some(x => x.questions.length));
    const recentMisses = [];
    if (lastStudy) lastStudy.sections.forEach(sec => {
      if (sec.type === 'cars' || sec.type === 'physics') return;
      sec.questions.forEach(q => { if (q.status !== 'correct') recentMisses.push({ ...q, date: lastStudy.isoDate }); });
    });

    // flagged ids
    const flaggedIds = [];
    sessions.forEach(s => s.sections.forEach(sec => sec.questions.forEach(q => { if (q.idSuspect) flaggedIds.push({ id: q.id, date: s.isoDate }); })));

    return { sessions, sci, avgScience, cars, latestCars, prevCars, weak, qIndex, anki, streak, isPriority, recentMisses, flaggedIds, lastStudy };
  }

  // ---------------------------------------------------------------- render
  function render(root, data) {
    const { mcat, config } = data;
    if (!mcat || !mcat.sessions || !mcat.sessions.length) {
      root.innerHTML = emptyState();
      return;
    }
    const d = derive(mcat, config);
    const today = DataLayer.todayISO();
    const daysToExam = DataLayer.daysBetween(today, config.examDate);
    const weeksToExam = Math.max(0, Math.round(daysToExam / 7));

    root.innerHTML = `
      ${head(config, daysToExam, weeksToExam)}
      ${kpiRow(d, config, daysToExam)}

      <div class="cols">
        ${scoreChartCard(d)}
        ${ankiCard(d, config)}
      </div>

      <div class="cols">
        ${carsCard(d, config)}
        ${weakTopicsCard(d)}
      </div>

      ${redoCard(d, config)}
      ${weeklyPlanCard(config)}
      ${dataNotes(d, mcat)}
    `;

    wireScoreToggle(root, d);
    wireRedo(root);
  }

  function head(config, days, weeks) {
    return `<div class="page-head">
      <h1>MCAT</h1>
      <p class="lede">Targeting <b>${config.targetScore}+</b> on <b>${DataLayer.prettyDate(config.examDate)}, 2026</b> — about <b>${days} days</b> (${weeks} weeks) out. Live-synced from Notion; everything below updates as the daily log changes.</p>
    </div>`;
  }

  function kpiRow(d, config, days) {
    const carsDelta = d.latestCars && d.prevCars ? d.latestCars.score - d.prevCars.score : null;
    const carsPill = carsDelta == null ? '' :
      `<span class="pill ${carsDelta >= 0 ? 'up' : 'down'}">${carsDelta >= 0 ? '▲' : '▼'} ${Math.abs(carsDelta)} pts</span>`;
    const sciVals = d.sci.filter(x => x.sec.scorePct != null).map(x => x.sec.scorePct);
    const carsVals = d.cars.map(c => c.score);
    return `<div class="grid kpi-row">
      <div class="card kpi accent">
        <span class="kpi-label">Study streak</span>
        <span class="kpi-value">${d.streak}<span class="unit">days</span></span>
        <span class="kpi-foot">consecutive study days logged</span>
      </div>
      <div class="card kpi good">
        <span class="kpi-label">Avg science score</span>
        <span class="kpi-value">${d.avgScience != null ? d.avgScience : '—'}<span class="unit">%</span></span>
        <span class="kpi-foot">Bio/Biochem + Gen/Org Chem, UWorld</span>
        ${Charts.spark(sciVals, { color: BIO })}
      </div>
      <div class="card kpi">
        <span class="kpi-label">Latest CARS</span>
        <span class="kpi-value">${d.latestCars ? d.latestCars.score : '—'}<span class="unit">%</span></span>
        <span class="kpi-foot">${d.latestCars ? (d.latestCars.provider || '') + ' · ' + DataLayer.prettyDate(d.latestCars.date) : 'no scored CARS yet'} ${carsPill}</span>
        ${Charts.spark(carsVals, { color: CARS })}
      </div>
      <div class="card kpi ${days <= 30 ? 'warn' : ''}">
        <span class="kpi-label">Days to exam</span>
        <span class="kpi-value">${days}</span>
        <span class="kpi-foot">${DataLayer.prettyDate(config.examDate)}, 2026</span>
      </div>
    </div>`;
  }

  // daily score chart with Score / Margin toggle
  function scoreSeries(d, mode) {
    const xLabels = d.sessions.map(s => DataLayer.shortDate(s.isoDate));
    const pick = (type, field) => d.sessions.map(s => {
      const sec = s.sections.find(x => x.type === type);
      return sec && sec[field] != null ? sec[field] : null;
    });
    const field = mode === 'margin' ? 'marginPct' : 'scorePct';
    return {
      xLabels,
      series: [
        { name: 'Bio/Biochem', color: BIO, values: pick('bio_biochem', field) },
        { name: 'Gen/Org Chem', color: CHEM, values: pick('gen_org_chem', field) },
      ],
    };
  }
  function scoreChartCard(d) {
    const init = scoreSeries(d, 'score');
    const svg = Charts.line({ xLabels: init.xLabels, series: init.series, yUnit: '%', connectNulls: true });
    return `<div class="card" id="scoreCard">
      <div class="card-head">
        <div><h3>Daily science scores</h3><div class="sub">UWorld sets · alternating Bio/Biochem &amp; Gen/Org Chem</div></div>
        <div class="legend">
          <span><i class="swatch" style="background:${BIO}"></i>Bio/Biochem</span>
          <span><i class="swatch" style="background:${CHEM}"></i>Gen/Org Chem</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button class="tab score-mode" data-mode="score" aria-selected="true">Absolute score</button>
        <button class="tab score-mode" data-mode="margin" aria-selected="false">vs Qbank avg</button>
      </div>
      <div class="chart" id="scoreChart">${svg}</div>
    </div>`;
  }
  function wireScoreToggle(root, d) {
    const card = root.querySelector('#scoreCard');
    if (!card) return;
    card.querySelectorAll('.score-mode').forEach(btn => btn.addEventListener('click', () => {
      card.querySelectorAll('.score-mode').forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      const mode = btn.dataset.mode;
      const s = scoreSeries(d, mode);
      const opts = { xLabels: s.xLabels, series: s.series, yUnit: '%', connectNulls: true };
      if (mode === 'margin') opts.yMin = Math.min(-5, ...s.series.flatMap(x => x.values).filter(v => v != null), -5);
      root.querySelector('#scoreChart').innerHTML = Charts.line(opts);
    }));
  }

  function carsCard(d, config) {
    const rows = d.cars.slice().reverse().map(c => {
      const delta = c.margin;
      const dpill = delta == null ? '<span class="muted">—</span>'
        : `<span class="pill ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}%</span>`;
      return `<tr>
        <td>${DataLayer.prettyDate(c.date)}</td>
        <td>${c.provider ? E(c.provider) : '<span class="muted">—</span>'}</td>
        <td class="num">${c.score != null ? c.score + '%' : '<span class="muted">—</span>'}</td>
        <td>${dpill}</td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <div class="card-head">
        <div><h3>CARS score history</h3><div class="sub">${Charts.spark(d.cars.map(c => c.score), { color: CARS })}</div></div>
      </div>
      <div class="callout" style="margin-bottom:12px">
        <span class="ic">💡</span>
        <div>${E(config.carsNote)}</div>
      </div>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Date</th><th>Source</th><th>Score</th><th>vs avg</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function weakTopicsCard(d) {
    const top = d.weak.slice(0, 11);
    const items = top.map(t => ({
      label: (d.isPriority(t.topic) ? '★ ' : '') + shorten(t.topic),
      value: t.flagged,
      color: t.subject === 'bio_biochem' ? BIO : CHEM,
      emphasis: d.isPriority(t.topic),
      tipTitle: t.topic,
      tip: `<b>${t.flagged}</b> flagged · <b>${t.wrong}</b> confirmed wrong${d.isPriority(t.topic) ? '<br>★ priority focus topic' : ''}`,
    }));
    return `<div class="card">
      <div class="card-head">
        <div><h3>Weak topics by frequency</h3><div class="sub">questions logged for review (excl. confirmed-correct)</div></div>
        <div class="legend">
          <span><i class="swatch" style="background:${BIO}"></i>Bio</span>
          <span><i class="swatch" style="background:${CHEM}"></i>Chem</span>
          <span>★ priority</span>
        </div>
      </div>
      <div class="chart">${Charts.barH({ items, unit: '' })}</div>
    </div>`;
  }

  function redoCard(d, config) {
    const groups = (config.mustRedo || []).slice().sort((a, b) => a.priority - b.priority);
    const totalIds = groups.reduce((a, g) => a + g.ids.length, 0);
    const html = groups.map(g => {
      const chips = g.ids.map(id => {
        const e = d.qIndex.get(id);
        const avg = e && e.uworldAvgPct != null ? ` · UW ${e.uworldAvgPct}%` : '';
        const seen = e ? ' · seen ' + e.dates.map(DataLayer.prettyDate).join(', ') : '';
        const tip = `${E(g.topic)}${avg}${seen}` + (e ? '' : '<br>not yet in the Notion log');
        return `<span class="redo-id" data-id="${id}" data-tip-title="Q ${id}" data-tip="${tip}">${id}</span>`;
      }).join('');
      return `<details class="redo-group" ${g.priority <= 2 ? 'open' : ''}>
        <summary>${g.priority === 1 ? '<i class="dot-prio"></i>' : ''}${E(g.topic)}
          <span class="count"><span class="done-count">0</span>/${g.ids.length} redone</span>
        </summary>
        <div class="redo-ids">${chips}</div>
      </details>`;
    }).join('');

    const recent = d.recentMisses.slice(0, 14).map(q =>
      `<span class="redo-id ${q.status === 'wrong' ? '' : ''}" data-tip-title="Q ${q.id}" data-tip="${E(q.topic)} · ${q.status}${q.note ? '<br>“' + E(q.note) + '”' : ''}">${q.id}</span>`
    ).join('');

    return `<div class="card" id="redoCard">
      <div class="card-head">
        <div><h3>Must-redo questions</h3><div class="sub">curated priority list · click an ID once you've redone it (saved locally)</div></div>
        <div class="sub"><span id="redoProgress">0</span>/${totalIds} done</div>
      </div>
      ${html}
      ${recent ? `<div class="section-title" style="margin-top:22px">Latest session misses <span class="hint">live from ${DataLayer.prettyDate(d.lastStudy.isoDate)} — ${E(d.lastStudy.date)}</span></div>
      <div class="redo-ids" style="padding-left:0">${recent}</div>` : ''}
    </div>`;
  }
  function wireRedo(root) {
    const card = root.querySelector('#redoCard');
    if (!card) return;
    const KEY = 'mcat.redo.done';
    const done = DataLayer.getChecked(KEY);
    const apply = () => {
      card.querySelectorAll('.redo-group .redo-id').forEach(el => el.classList.toggle('done', done.has(el.dataset.id)));
      card.querySelectorAll('.redo-group').forEach(g => {
        const ids = [...g.querySelectorAll('.redo-id')];
        const n = ids.filter(el => done.has(el.dataset.id)).length;
        const c = g.querySelector('.done-count'); if (c) c.textContent = n;
      });
      const all = [...card.querySelectorAll('.redo-group .redo-id')];
      const total = all.length, doneN = all.filter(el => done.has(el.dataset.id)).length;
      const p = card.querySelector('#redoProgress'); if (p) p.textContent = doneN;
    };
    card.querySelectorAll('.redo-group .redo-id').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (done.has(id)) done.delete(id); else done.add(id);
      DataLayer.setChecked(KEY, done);
      apply();
    }));
    apply();
  }

  function ankiCard(d, config) {
    const target = (config.anki && config.anki.dailyTargetCards) || 0;
    if (!d.anki.length) {
      return `<div class="card"><div class="card-head"><h3>Anki</h3></div>
        <div class="empty">No Anki sessions logged yet.<br>Add “Anki: Studied N cards in M minutes” to a Notion day page and it appears here.</div></div>`;
    }
    const latest = d.anki[d.anki.length - 1];
    const total = d.anki.reduce((a, x) => a + x.cards, 0);
    const totalMin = d.anki.reduce((a, x) => a + x.minutes, 0);
    const secPer = (latest.minutes * 60 / latest.cards).toFixed(1);
    return `<div class="card">
      <div class="card-head"><div><h3>Anki</h3><div class="sub">most recent: ${DataLayer.prettyDate(latest.date)}</div></div></div>
      <div class="anki-row">
        ${Charts.ring(latest.cards, target, { color: CARS, center: latest.cards, sub: 'of ' + target })}
        <div class="deck-list">
          <div class="deck"><span>📇</span><span><b>${latest.cards.toLocaleString()}</b> cards reviewed</span></div>
          <div class="deck"><span>⏱️</span><span><b>${latest.minutes}</b> min · ${secPer}s / card</span></div>
          <div class="deck"><span>Σ</span><span><b>${total.toLocaleString()}</b> cards over ${d.anki.length} logged day${d.anki.length > 1 ? 's' : ''} (${Math.round(totalMin / 60)}h)</span></div>
          ${d.anki.length > 1 ? `<div style="margin-top:4px">${Charts.spark(d.anki.map(a => a.cards), { color: CARS })}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function weeklyPlanCard(config) {
    const todayName = DataLayer.weekdayName();
    const days = (config.weeklyPlan || []).map(day => {
      const items = day.items.map(it => `<div class="task"><span class="tag ${E(it.tag)}">${E(it.tag)}</span> ${E(it.text)}</div>`).join('');
      return `<div class="day ${day.day === todayName ? 'today' : ''}">
        <div class="dname">${E(day.day)}${day.day === todayName ? ' · today' : ''}</div>${items}</div>`;
    }).join('');
    return `<div class="section-title">Weekly plan <span class="hint">edit in data/mcat-config.json</span></div>
      <div class="card"><div class="week">${days}</div></div>`;
  }

  function dataNotes(d, mcat) {
    const flagged = d.flaggedIds;
    const parts = [];
    if (flagged.length) parts.push(`⚠ ${flagged.length} question ID${flagged.length > 1 ? 's' : ''} look mistyped in Notion (${flagged.map(f => E(f.id)).join(', ')}) — fix there and they'll self-correct on the next sync.`);
    const stamp = mcat.generatedAt ? new Date(mcat.generatedAt).toLocaleString() : '';
    parts.push(`Synced from Notion${stamp ? ' · ' + stamp : ''} · ${mcat.sessions.length} sessions.`);
    return `<p class="muted" style="margin-top:20px">${parts.join(' &nbsp;·&nbsp; ')}</p>`;
  }

  function shorten(t) { return t.length > 26 ? t.slice(0, 24) + '…' : t; }

  function emptyState() {
    return `<div class="page-head"><h1>MCAT</h1></div>
      <div class="card"><div class="empty">No MCAT data found yet.<br>
      Add your <code>NOTION_TOKEN</code> secret and run the <b>Sync MCAT data</b> GitHub Action — it writes <code>data/mcat.json</code> from your Notion log.</div></div>`;
  }

  window.MCAT = { render };
})();
