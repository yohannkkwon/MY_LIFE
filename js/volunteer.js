/* volunteer.js — shifts, hours logged, and a schedule view */
(function () {
  'use strict';
  const E = Charts.esc;

  function render(root, data) {
    const v = data.volunteer;
    if (!v || !v.shifts) { root.innerHTML = `<div class="page-head"><h1>Volunteer</h1></div><div class="card"><div class="empty">No volunteer data found.</div></div>`; return; }
    const today = DataLayer.todayISO();
    const shifts = v.shifts.slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const completed = shifts.filter(s => s.status === 'completed' || s.date < today);
    const upcoming = shifts.filter(s => s.status !== 'completed' && s.date >= today).sort((a, b) => a.date < b.date ? -1 : 1);
    const totalHours = completed.reduce((a, s) => a + (s.hours || 0), 0);

    // per-org totals
    const byOrg = {};
    completed.forEach(s => { byOrg[s.org] = (byOrg[s.org] || 0) + s.hours; });
    const orgColor = o => (v.orgs && v.orgs[o] && v.orgs[o].color) || 'var(--accent)';
    const maxOrg = Math.max(1, ...Object.values(byOrg));

    const next = upcoming[0];

    root.innerHTML = `
      <div class="page-head">
        <h1>Volunteer</h1>
        <p class="lede">Clinical and community volunteering — Scripps Health (ICU &amp; ED) and RHA.</p>
      </div>

      <div class="grid kpi-row">
        <div class="card kpi accent">
          <span class="kpi-label">Hours logged</span>
          <span class="kpi-value">${totalHours % 1 ? totalHours.toFixed(1) : totalHours}<span class="unit">hrs</span></span>
          <span class="kpi-foot">${completed.length} completed shifts</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">Upcoming shifts</span>
          <span class="kpi-value">${upcoming.length}</span>
          <span class="kpi-foot">${next ? 'next: ' + DataLayer.prettyDate(next.date) : 'none scheduled'}</span>
        </div>
        <div class="card kpi good">
          <span class="kpi-label">Next shift</span>
          <span class="kpi-value" style="font-size:22px;line-height:1.2">${next ? E(next.org.split(' ')[0]) + ' ' + E(next.role) : '—'}</span>
          <span class="kpi-foot">${next ? DataLayer.prettyDate(next.date) + ' · ' + next.hours + ' hrs' : ''}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">Organizations</span>
          <span class="kpi-value">${Object.keys(v.orgs || {}).length || new Set(shifts.map(s => s.org)).size}</span>
          <span class="kpi-foot">${Object.keys(v.orgs || {}).map(E).join(' · ')}</span>
        </div>
      </div>

      <div class="cols">
        <div class="card">
          <div class="card-head"><h3>Schedule</h3><div class="sub">${shifts.length} shifts</div></div>
          <div class="table-scroll"><table class="data">
            <thead><tr><th>Date</th><th>Org</th><th>Role</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>${shifts.slice().reverse().map(s => `
              <tr>
                <td>${DataLayer.prettyDate(s.date)}</td>
                <td><span class="swatch" style="background:${orgColor(s.org)};margin-right:7px"></span>${E(s.org)}</td>
                <td>${E(s.role)}</td>
                <td class="num">${s.hours}</td>
                <td>${(s.status === 'completed' || s.date < today) ? '<span class="pill up">✓ done</span>' : '<span class="pill blue">upcoming</span>'}</td>
              </tr>`).join('')}</tbody>
          </table></div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Hours by organization</h3></div>
            ${Object.keys(byOrg).length ? Object.entries(byOrg).sort((a, b) => b[1] - a[1]).map(([o, h]) => `
              <div class="deck">
                <span style="min-width:120px">${E(o)}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${(h / maxOrg * 100).toFixed(0)}%;background:${orgColor(o)}"></span></span>
                <span class="deck-n">${h % 1 ? h.toFixed(1) : h} hrs</span>
              </div>`).join('') : '<div class="empty">No completed hours yet.</div>'}
          </div>
          <div class="card">
            <div class="card-head"><h3>Upcoming</h3></div>
            ${upcoming.length ? `<div class="stack">${upcoming.map(s => `
              <div class="info-item">
                <span class="k">${DataLayer.prettyDate(s.date)}</span>
                <span class="v"><b>${E(s.org)}</b> — ${E(s.role)} · ${s.hours} hrs</span>
              </div>`).join('')}</div>` : '<div class="empty">Nothing scheduled.</div>'}
          </div>
        </div>
      </div>
      <p class="muted" style="margin-top:18px">Edit shifts in <code>data/volunteer.json</code>.</p>
    `;
  }

  window.Volunteer = { render };
})();
