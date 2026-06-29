/* app.js — tab routing, theme, data load + render orchestration */
(function () {
  'use strict';

  const TABS = ['mcat', 'volunteer', 'school', 'extracurriculars'];
  let DATA = null;
  const rendered = {};

  const renderers = {
    mcat: (root) => window.MCAT.render(root, DATA),
    volunteer: (root) => window.Volunteer.render(root, DATA),
    school: (root) => window.School.render(root, DATA),
    extracurriculars: (root) => window.Extracurriculars.render(root, DATA),
  };

  function showTab(name, push) {
    if (!TABS.includes(name)) name = 'mcat';
    document.querySelectorAll('.tab[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    TABS.forEach(t => {
      const panel = document.getElementById('panel-' + t);
      if (!panel) return;
      const active = t === name;
      panel.hidden = !active;
      if (active && !rendered[t]) {
        try { renderers[t](panel); rendered[t] = true; }
        catch (e) { panel.innerHTML = '<div class="card"><div class="empty">Could not render this tab.</div></div>'; console.error(e); }
      }
    });
    if (push && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  // ---- theme ----
  function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const isDark = cur ? cur === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  function footerStamp() {
    const el = document.getElementById('dataStamp');
    if (!el) return;
    if (DATA && DATA.mcat && DATA.mcat.generatedAt) {
      el.textContent = 'MCAT data synced ' + new Date(DATA.mcat.generatedAt).toLocaleString();
    } else {
      el.textContent = '';
    }
  }

  async function boot() {
    initTheme();
    document.querySelectorAll('.tab[data-tab]').forEach(b =>
      b.addEventListener('click', () => showTab(b.dataset.tab, true)));
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));

    try { DATA = await DataLayer.loadAll(); }
    catch (e) { DATA = { mcat: null, config: null, volunteer: null }; console.error(e); }

    footerStamp();
    showTab(location.hash.slice(1) || 'mcat', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
