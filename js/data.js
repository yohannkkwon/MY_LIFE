/* data.js — load JSON data files and expose small shared helpers. */
(function () {
  'use strict';

  async function getJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' -> ' + res.status);
    return res.json();
  }

  async function loadAll() {
    const [mcat, config, volunteer] = await Promise.all([
      getJSON('data/mcat.json').catch(() => null),
      getJSON('data/mcat-config.json').catch(() => null),
      getJSON('data/volunteer.json').catch(() => null),
    ]);
    return { mcat, config, volunteer };
  }

  // ---- date helpers --------------------------------------------------------
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + 'T00:00:00');
    const b = new Date(bISO + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function prettyDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function shortDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function weekdayName() {
    return new Date().toLocaleDateString('en-US', { weekday: 'short' });
  }

  // localStorage-backed checkbox state (for the redo list)
  function getChecked(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch (_) { return new Set(); }
  }
  function setChecked(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) {}
  }

  window.DataLayer = { loadAll, todayISO, daysBetween, prettyDate, shortDate, weekdayName, getChecked, setChecked };
})();
