/* extracurriculars.js — activities. Hand-edit the ITEMS array below. */
(function () {
  'use strict';
  const E = Charts.esc;

  const ITEMS = [
    { icon: '🔬', title: 'Research — Mertens Lab', tag: 'Research', text: 'Assistant researcher at the Mertens Lab (Sanford Consortium), using R for analysis.', active: true },
    { icon: '🏥', title: 'Scripps Health Volunteer', tag: 'Clinical', text: 'ICU and ED volunteer shifts on alternating weeks. See the Volunteer tab for hours and schedule.', active: true },
    { icon: '🤝', title: 'RHA', tag: 'Community', text: 'Resident Hospital Association volunteer — longer-form service shifts.', active: true },
    { icon: '🧬', title: 'Pre-med journey', tag: 'Pre-med', text: 'MCAT prep (target 512+, Sep 2026) — tracked live on the MCAT tab.', active: true }
  ];

  function render(root) {
    root.innerHTML = `
      <div class="page-head">
        <h1>Extracurriculars</h1>
        <p class="lede">Research, clinical volunteering, and community involvement alongside the pre-med track.</p>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${ITEMS.map(it => `
          <div class="card stack">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:26px">${it.icon}</span>
              <div>
                <div style="font-weight:640">${E(it.title)}</div>
                <span class="pill ${it.active ? 'up' : 'neutral'}">${it.active ? 'Active' : 'Past'} · ${E(it.tag)}</span>
              </div>
            </div>
            <div style="font-size:13.5px;color:var(--text-muted);line-height:1.5">${E(it.text)}</div>
          </div>`).join('')}
      </div>
      <p class="muted" style="margin-top:18px">Edit this section in <code>js/extracurriculars.js</code>.</p>
    `;
  }

  window.Extracurriculars = { render };
})();
