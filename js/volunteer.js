/* volunteer.js — minimal: hours logged + committed total, split by ICU/ED/RHA */
(function () {
  'use strict';
  const E = Charts.esc;
  const fmt = (h) => (h % 1 ? h.toFixed(2).replace(/0$/, '') : String(h));

  const CAT_COLOR = { ICU: 'var(--accent)', ED: 'var(--warn)', RHA: 'var(--blue)' };

  function render(root, data) {
    const v = data.volunteer;
    if (!v || !v.shifts) { root.innerHTML = `<div class="page-head"><h1>Volunteer</h1></div><div class="card"><div class="empty">No volunteer data found.</div></div>`; return; }
    const today = DataLayer.todayISO();
    const orgs = v.orgs || {};
    const isDone = (s) => s.status === 'completed' || s.date < today;
    const completed = v.shifts.filter(isDone);

    const priorTotal = Object.values(orgs).reduce((a, o) => a + (o.priorHours || 0), 0);
    const committed = priorTotal + v.shifts.reduce((a, s) => a + (s.hours || 0), 0);

    // logged hours split by category: ICU / ED (Scripps roles) and RHA (org)
    const cat = { ICU: 0, ED: 0, RHA: 0 };
    completed.forEach(s => {
      const k = s.org === 'RHA' ? 'RHA' : s.role; // ICU or ED
      if (cat[k] != null) cat[k] += s.hours; else cat[k] = (cat[k] || 0) + s.hours;
    });
    const logged = priorTotal + Object.values(cat).reduce((a, b) => a + b, 0);
    const maxCat = Math.max(1, ...Object.values(cat));

    const bars = ['ICU', 'ED', 'RHA'].map(k => `
      <div class="weakrow" style="grid-template-columns:60px 1fr 72px;margin-bottom:14px">
        <div class="weaktopic" style="font-weight:600">${k}</div>
        <div class="weakbar"><div class="weakfill" style="width:${(cat[k] / maxCat * 100).toFixed(0)}%;background:${CAT_COLOR[k]}"></div></div>
        <div class="weakcount">${fmt(cat[k] || 0)} hrs</div>
      </div>`).join('');

    root.innerHTML = `
      <div class="page-head"><h1>Volunteer</h1></div>
      <div class="dash">
        <div class="grid cols-even">
          <div class="card bigstat">
            <span class="bs-label">Hours logged</span>
            <span class="bs-value">${fmt(logged)}<span class="unit">hrs</span></span>
            <span class="bs-foot">${completed.length} shifts done${priorTotal ? ' + ' + fmt(priorTotal) + ' prior Scripps hrs' : ''}</span>
          </div>
          <div class="card bigstat alt">
            <span class="bs-label">Committed total</span>
            <span class="bs-value">${fmt(committed)}<span class="unit">hrs</span></span>
            <span class="bs-foot">${v.shifts.length} shifts scheduled through exam season</span>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Hours logged by area</h3></div>
          ${bars}
          ${priorTotal ? `<p class="muted" style="margin-top:12px">Logged total also includes ${fmt(priorTotal)} prior Scripps hrs not split by unit.</p>` : ''}
        </div>
      </div>
      <p class="muted" style="margin-top:18px">Edit shifts in <code>data/volunteer.json</code>.</p>
    `;
  }

  window.Volunteer = { render };
})();
