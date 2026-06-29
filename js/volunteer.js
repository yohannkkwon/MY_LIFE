/* volunteer.js — shifts, hours logged, and a schedule view */
(function () {
  'use strict';
  const E = Charts.esc;
  const fmt = (h) => (h % 1 ? h.toFixed(2).replace(/0$/, '') : String(h));

  function render(root, data) {
    const v = data.volunteer;
    if (!v || !v.shifts) { root.innerHTML = `<div class="page-head"><h1>Volunteer</h1></div><div class="card"><div class="empty">No volunteer data found.</div></div>`; return; }
    const today = DataLayer.todayISO();
    const orgs = v.orgs || {};
    const shifts = v.shifts.slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const isDone = (s) => s.status === 'completed' || s.date < today;
    const completed = shifts.filter(isDone);
    const upcoming = shifts.filter(s => !isDone(s)).sort((a, b) => a.date < b.date ? -1 : 1);

    const priorTotal = Object.values(orgs).reduce((a, o) => a + (o.priorHours || 0), 0);
    const loggedHours = priorTotal + completed.reduce((a, s) => a + (s.hours || 0), 0);
    const committedHours = priorTotal + shifts.reduce((a, s) => a + (s.hours || 0), 0);

    // per-org logged = prior + completed shift hours
    const byOrg = {};
    Object.keys(orgs).forEach(o => { byOrg[o] = orgs[o].priorHours || 0; });
    completed.forEach(s => { byOrg[s.org] = (byOrg[s.org] || 0) + s.hours; });
    const orgColor = o => (orgs[o] && orgs[o].color) || 'var(--accent)';
    const maxOrg = Math.max(1, ...Object.values(byOrg));
    const next = upcoming[0];

    root.innerHTML = `
      <div class="page-head">
        <h1>Volunteer</h1>
        <p class="lede">Clinical and community volunteering — Scripps Health (ICU &amp; ED) and RHA. <b>${fmt(loggedHours)}</b> of <b>${fmt(committedHours)}</b> committed hours logged through exam season.</p>
      </div>

      <div class="grid kpi-row">
        <div class="card kpi accent">
          <span class="kpi-label">Hours logged</span>
          <span class="kpi-value">${fmt(loggedHours)}<span class="unit">hrs</span></span>
          <span class="kpi-foot">${completed.length} shifts done${priorTotal ? ' + ' + fmt(priorTotal) + ' prior' : ''}</span>
        </div>
        <div class="card kpi good">
          <span class="kpi-label">Committed total</span>
          <span class="kpi-value">${fmt(committedHours)}<span class="unit">hrs</span></span>
          <span class="kpi-foot">${shifts.length} shifts scheduled</span>
          ${ringPct(loggedHours, committedHours)}
        </div>
        <div class="card kpi">
          <span class="kpi-label">Upcoming shifts</span>
          <span class="kpi-value">${upcoming.length}</span>
          <span class="kpi-foot">${next ? 'next: ' + DataLayer.prettyDate(next.date) : 'none scheduled'}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">Next shift</span>
          <span class="kpi-value" style="font-size:20px;line-height:1.2">${next ? E(next.org.split(' ')[0]) + ' ' + E(next.role) : '—'}</span>
          <span class="kpi-foot">${next ? DataLayer.prettyDate(next.date) + ' · ' + fmt(next.hours) + ' hrs' : ''}</span>
        </div>
      </div>

      <div class="cols">
        <div class="card">
          <div class="card-head"><h3>Schedule</h3><div class="sub">${shifts.length} shifts · upcoming first</div></div>
          <div class="table-scroll" style="max-height:520px;overflow-y:auto">
            <table class="data">
              <thead><tr><th>Date</th><th>Org</th><th>Role</th><th>Hours</th><th>Status</th></tr></thead>
              <tbody>${shifts.slice().reverse().map(s => `
                <tr style="${isDone(s) ? 'opacity:.62' : ''}">
                  <td>${DataLayer.prettyDate(s.date)}<span class="muted"> '${s.date.slice(2, 4)}</span></td>
                  <td><span class="swatch" style="background:${orgColor(s.org)};margin-right:7px"></span>${E(s.org)}</td>
                  <td>${E(s.role)}</td>
                  <td class="num">${fmt(s.hours)}</td>
                  <td>${isDone(s) ? '<span class="pill up">✓ done</span>' : '<span class="pill blue">upcoming</span>'}</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Hours logged by org</h3></div>
            ${Object.entries(byOrg).sort((a, b) => b[1] - a[1]).map(([o, h]) => `
              <div class="deck">
                <span style="min-width:118px">${E(o)}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${(h / maxOrg * 100).toFixed(0)}%;background:${orgColor(o)}"></span></span>
                <span class="deck-n">${fmt(h)} hrs</span>
              </div>`).join('')}
            <p class="muted" style="margin-top:10px">${fmt(loggedHours)} hrs logged · ${fmt(committedHours - loggedHours)} hrs still scheduled.</p>
          </div>
          <div class="card">
            <div class="card-head"><h3>Next up</h3></div>
            ${upcoming.length ? `<div class="stack">${upcoming.slice(0, 6).map(s => `
              <div class="info-item">
                <span class="k">${DataLayer.prettyDate(s.date)}</span>
                <span class="v"><b>${E(s.org.split(' ')[0])}</b> — ${E(s.role)} · ${fmt(s.hours)} hrs</span>
              </div>`).join('')}</div>${upcoming.length > 6 ? `<p class="muted" style="margin-top:8px">+ ${upcoming.length - 6} more in the schedule.</p>` : ''}` : '<div class="empty">Nothing scheduled.</div>'}
          </div>
        </div>
      </div>
      <p class="muted" style="margin-top:18px">Edit shifts in <code>data/volunteer.json</code>.</p>
    `;
  }

  function ringPct(logged, total) {
    return Charts.ring(logged, total, { color: 'var(--good)', center: Math.round(total ? logged / total * 100 : 0) + '%', sub: 'logged' })
      .replace('class="ring"', 'class="ring" style="position:absolute;right:12px;bottom:10px;width:64px;height:64px"');
  }

  window.Volunteer = { render };
})();
