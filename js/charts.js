/* charts.js — tiny dependency-free SVG charts (line, horizontal bar, sparkline,
   progress ring) + a shared hover tooltip. No frameworks, no build step. */
(function () {
  'use strict';

  // ---- shared tooltip (event-delegated on [data-tip]) ----------------------
  let tip;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'tooltip';
    document.body.appendChild(tip);
    return tip;
  }
  function moveTip(e) {
    const t = ensureTip();
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    const t = ensureTip();
    const title = el.getAttribute('data-tip-title');
    t.innerHTML = (title ? '<div class="tt-title">' + esc(title) + '</div>' : '') +
      el.getAttribute('data-tip');
    t.classList.add('show');
    moveTip(e);
  });
  document.addEventListener('mousemove', function (e) {
    if (tip && tip.classList.contains('show') && e.target.closest('[data-tip]')) moveTip(e);
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest('[data-tip]') && tip) tip.classList.remove('show');
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function niceCeil(v) {
    if (v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  // ---- line chart ----------------------------------------------------------
  // opts: { xLabels:[..], series:[{name,color,values:[num|null]}], yMin,yMax, yUnit, height }
  function line(opts) {
    const W = 760, H = opts.height || 300;
    const m = { t: 16, r: 16, b: 34, l: 38 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = opts.xLabels;
    const all = opts.series.flatMap(s => s.values).filter(v => v != null);
    const yMin = opts.yMin != null ? opts.yMin : Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10);
    const yMax = opts.yMax != null ? opts.yMax : Math.ceil((Math.max(...all) + 5) / 10) * 10;
    const xAt = i => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
    const yAt = v => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="line chart">`;
    // y gridlines + labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = yMin + (i / ticks) * (yMax - yMin);
      const y = yAt(val);
      svg += `<line class="grid-line" x1="${m.l}" y1="${y.toFixed(1)}" x2="${m.l + iw}" y2="${y.toFixed(1)}"/>`;
      svg += `<text class="axis-text" x="${m.l - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${Math.round(val)}${opts.yUnit || ''}</text>`;
    }
    // x labels (thin out if crowded)
    const everyX = xs.length > 9 ? 2 : 1;
    xs.forEach((lab, i) => {
      if (i % everyX !== 0 && i !== xs.length - 1) return;
      svg += `<text class="axis-text" x="${xAt(i).toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(lab)}</text>`;
    });
    // series
    opts.series.forEach(s => {
      // split into segments across nulls
      let seg = [];
      const flush = () => {
        if (seg.length) {
          const d = seg.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
          svg += `<path class="line-path" d="${d}" stroke="${s.color}"/>`;
          seg = [];
        }
      };
      s.values.forEach((v, i) => { if (v == null) { if (!opts.connectNulls) flush(); } else seg.push({ x: xAt(i), y: yAt(v) }); });
      flush();
      // dots
      s.values.forEach((v, i) => {
        if (v == null) return;
        const tipHtml = `${s.name}: <b>${v}${opts.yUnit || ''}</b>`;
        svg += `<circle class="dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="4.5" fill="${s.color}" `
          + `data-tip-title="${esc(xs[i])}" data-tip="${esc(tipHtml)}"/>`;
      });
    });
    svg += `</svg>`;
    return svg;
  }

  // ---- horizontal bar chart ------------------------------------------------
  // opts: { items:[{label,value,sub,color,emphasis,tip,tipTitle}], unit }
  function barH(opts) {
    const items = opts.items;
    const rowH = 30, gap = 8, padL = 0, padR = 46, labelW = 0;
    const W = 760;
    const H = items.length * (rowH + gap);
    const max = opts.max || niceCeil(Math.max(1, ...items.map(d => d.value)));
    const barX = 150, barW = W - barX - padR;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="bar chart">`;
    items.forEach((d, i) => {
      const y = i * (rowH + gap);
      const w = Math.max(2, (d.value / max) * barW);
      const color = d.color || 'var(--accent)';
      svg += `<text class="bar-label" x="0" y="${y + rowH / 2 + 4}" ${d.emphasis ? 'font-weight="700"' : ''}>${esc(d.label)}</text>`;
      svg += `<rect x="${barX}" y="${y + 4}" width="${barW}" height="${rowH - 8}" rx="5" fill="var(--surface-2)"/>`;
      svg += `<rect class="bar" x="${barX}" y="${y + 4}" width="${w.toFixed(1)}" height="${rowH - 8}" rx="5" fill="${color}" `
        + `data-tip-title="${esc(d.tipTitle || d.label)}" data-tip="${esc(d.tip || (d.value + (opts.unit || '')))}"/>`;
      svg += `<text class="bar-val" x="${barX + w + 6}" y="${y + rowH / 2 + 4}">${d.value}${opts.unit || ''}</text>`;
    });
    svg += `</svg>`;
    return svg;
  }

  // ---- sparkline -----------------------------------------------------------
  function spark(values, opts) {
    opts = opts || {};
    const vals = values.filter(v => v != null);
    if (vals.length < 2) return '';
    const W = 96, H = 38, p = 3;
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const xAt = i => p + (i / (values.length - 1)) * (W - 2 * p);
    const yAt = v => H - p - ((v - min) / span) * (H - 2 * p);
    let d = '', started = false;
    values.forEach((v, i) => { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1) + ' '; started = true; });
    const color = opts.color || 'var(--accent)';
    const last = values.map((v, i) => [v, i]).filter(p => p[0] != null).pop();
    return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      + (last ? `<circle cx="${xAt(last[1]).toFixed(1)}" cy="${yAt(last[0]).toFixed(1)}" r="2.6" fill="${color}"/>` : '')
      + `</svg>`;
  }

  // ---- progress ring -------------------------------------------------------
  function ring(value, max, opts) {
    opts = opts || {};
    const S = 92, sw = 9, r = (S - sw) / 2, c = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, max ? value / max : 0));
    const color = opts.color || 'var(--accent)';
    return `<svg class="ring" viewBox="0 0 ${S} ${S}">`
      + `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>`
      + `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" `
      + `stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${S / 2} ${S / 2})"/>`
      + `<text x="${S / 2}" y="${S / 2 - 2}" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="var(--font-serif)">${opts.center != null ? opts.center : Math.round(frac * 100) + '%'}</text>`
      + (opts.sub ? `<text x="${S / 2}" y="${S / 2 + 15}" text-anchor="middle" font-size="9.5" fill="var(--text-muted)">${esc(opts.sub)}</text>` : '')
      + `</svg>`;
  }

  window.Charts = { line, barH, spark, ring, esc };
})();
