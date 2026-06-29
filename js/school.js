/* school.js — academic profile. Hand-edit the CONTENT object below. */
(function () {
  'use strict';
  const E = Charts.esc;

  const CONTENT = {
    school: 'UC San Diego',
    year: 'Third year',
    majors: ['Data Science', 'Biochemistry'],
    track: 'Pre-med',
    tools: ['Python (coursework)', 'R (research)'],
    research: {
      lab: 'Mertens Lab — Sanford Consortium for Regenerative Medicine',
      role: 'Assistant Researcher',
      note: 'Direct iPSC reprogramming / neuronal aging research.'
    },
    coursework: [
      'Data Structures & Algorithms', 'Probability & Statistics', 'Linear Algebra',
      'Organic Chemistry', 'Biochemistry', 'Molecular Biology', 'Genetics'
    ]
  };

  function render(root) {
    const c = CONTENT;
    root.innerHTML = `
      <div class="page-head">
        <h1>School</h1>
        <p class="lede">${E(c.year)} at ${E(c.school)} · double major in ${c.majors.map(E).join(' & ')} · ${E(c.track)}.</p>
      </div>

      <div class="cols-even" style="display:grid;gap:16px">
        <div class="card">
          <div class="card-head"><h3>Overview</h3></div>
          <div class="info-list">
            <div class="info-item"><span class="k">University</span><span class="v">${E(c.school)}</span></div>
            <div class="info-item"><span class="k">Year</span><span class="v">${E(c.year)}</span></div>
            <div class="info-item"><span class="k">Majors</span><span class="v">${c.majors.map(m => `<span class="chip">${E(m)}</span>`).join(' ')}</span></div>
            <div class="info-item"><span class="k">Track</span><span class="v">${E(c.track)}</span></div>
            <div class="info-item"><span class="k">Tools</span><span class="v">${c.tools.map(t => `<span class="chip">${E(t)}</span>`).join(' ')}</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Research</h3></div>
          <div class="info-list">
            <div class="info-item"><span class="k">Lab</span><span class="v"><b>${E(c.research.lab)}</b></span></div>
            <div class="info-item"><span class="k">Role</span><span class="v">${E(c.research.role)}</span></div>
            <div class="info-item"><span class="k">Focus</span><span class="v">${E(c.research.note)}</span></div>
          </div>
        </div>
      </div>

      <div class="section-title">Relevant coursework</div>
      <div class="card"><div class="chips">${c.coursework.map(x => `<span class="chip">${E(x)}</span>`).join('')}</div></div>

      <p class="muted" style="margin-top:18px">Edit this section in <code>js/school.js</code>.</p>
    `;
  }

  window.School = { render };
})();
