/* v3: product illustrations (reference 3), portfolio progress ring (reference 3), Focus & Next Actions (reference 4),
   Company Trajectory on Home (reference 1). Replaces productsTab from portfolio.js. All values are demo values. */
S.focus = {};
function sceneSVG(id) {
  const gid = 'sc' + id;
  if (id === 'rt') {
    const bl = [[14, 30, 44], [48, 26, 62], [78, 34, 40], [116, 22, 72], [142, 40, 52], [186, 28, 66], [218, 34, 46], [256, 26, 74], [286, 36, 50], [326, 24, 38]];
    const body = bl.map(([x, w, h], i) => { let win = ''; for (let r = 0; r < Math.floor((h - 6) / 9); r++) for (let c = 0; c < Math.floor((w - 6) / 8); c++) if ((i * 7 + r * 3 + c * 5) % 4 === 0) win += `<rect x="${x + 4 + c * 8}" y="${96 - h + 5 + r * 9}" width="3.5" height="4.5" fill="#F3D9A4" opacity=".75"/>`; return `<rect x="${x}" y="${96 - h}" width="${w}" height="${h}" fill="#0C1626"/>${win}`; }).join('');
    return `<svg class="pscene" viewBox="0 0 360 96" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${gid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16263F"/><stop offset="1" stop-color="#0F1B2D"/></linearGradient><radialGradient id="${gid}b" cx=".62" cy="1" r=".7"><stop offset="0" stop-color="#DDAA57" stop-opacity=".4"/><stop offset="1" stop-color="#DDAA57" stop-opacity="0"/></radialGradient></defs><rect width="360" height="96" fill="url(#${gid}a)"/><rect width="360" height="96" fill="url(#${gid}b)"/>${body}<line x1="269" y1="22" x2="269" y2="14" stroke="#DDAA57" stroke-width="1.2"/><circle cx="269" cy="13" r="2" fill="#EDBE6F"/></svg>`;
  }
  if (id === 'kh') return `<svg class="pscene" viewBox="0 0 360 96" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${gid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10253A"/><stop offset="1" stop-color="#16303A"/></linearGradient><radialGradient id="${gid}b" cx=".5" cy=".72" r=".5"><stop offset="0" stop-color="#37D5C4" stop-opacity=".45"/><stop offset="1" stop-color="#37D5C4" stop-opacity="0"/></radialGradient></defs><rect width="360" height="96" fill="url(#${gid}a)"/><circle cx="190" cy="66" r="60" fill="url(#${gid}b)"/><polygon points="190,18 118,92 262,92" fill="#0D1E2E"/><polygon points="190,18 262,92 198,92" fill="#08141F"/><polyline points="118,92 190,18 262,92" fill="none" stroke="#37D5C4" stroke-opacity=".55" stroke-width="1.2"/><polygon points="290,52 252,92 330,92" fill="#0B1A29"/><polygon points="70,64 40,92 104,92" fill="#0B1A29"/><path d="M0 90 C70 80 140 92 220 86 S330 82 360 90 V96 H0Z" fill="#07111C"/></svg>`;
  const bars = [[22, 30], [52, 44], [82, 36], [112, 56], [142, 48], [172, 66], [202, 58], [232, 74], [262, 64], [292, 82]].map(([x, h]) => `<rect x="${x}" y="${96 - h}" width="18" height="${h}" rx="3" fill="url(#${gid}c)"/>`).join('');
  return `<svg class="pscene" viewBox="0 0 360 96" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${gid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13244A"/><stop offset="1" stop-color="#0F1B33"/></linearGradient><linearGradient id="${gid}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B9BF0" stop-opacity=".9"/><stop offset="1" stop-color="#5B9BF0" stop-opacity=".12"/></linearGradient><radialGradient id="${gid}b" cx=".8" cy=".3" r=".6"><stop offset="0" stop-color="#9280CF" stop-opacity=".35"/><stop offset="1" stop-color="#9280CF" stop-opacity="0"/></radialGradient></defs><rect width="360" height="96" fill="url(#${gid}a)"/><rect width="360" height="96" fill="url(#${gid}b)"/>${bars}<polyline points="31,60 61,48 91,54 121,36 151,42 181,24 211,30 241,14 271,22 301,8" fill="none" stroke="#CFE0FF" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></svg>`;
}
function richCard(p) {
  return projectCard(p).replace(/^(<button class="pcard)([^>]*>)/, `$1 rich$2${sceneSVG(p.id)}`);
}
function ringPanel() {
  const v = visProjects(), d = v.reduce((a, p) => a + p.ms.done, 0), t = v.reduce((a, p) => a + p.ms.total, 0), R = 52, C = 2 * Math.PI * R;
  const col = {rt:'var(--ch-2)', kh:'var(--ch-1)', se:'var(--ch-3)'};
  let off = 0; const segs = v.map(p => { const len = p.ms.done / (t || 1) * C; const s = `<circle cx="66" cy="66" r="${R}" fill="none" stroke="${col[p.id]}" stroke-width="11" stroke-dasharray="${Math.max(0, len - 3)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 66 66)"/>`; off += len; return s; }).join('');
  return `<section class="panel c4" aria-labelledby="h-ring">${panelHead('flag', `<span id="h-ring">${_('Portfolio progress', 'تقدم المحفظة')}</span>`)}
    <div class="ringp"><svg viewBox="0 0 132 132" role="img" aria-label="${d} ${_('of', 'من')} ${t} ${_('milestones done', 'معالم منجزة')}"><circle cx="66" cy="66" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="11"/>${segs}<text x="66" y="64" text-anchor="middle" style="fill:#EAF0F8;font:700 24px var(--f-ui)">${d}<tspan style="font-size:14px;fill:#B9C5D5">/${t}</tspan></text><text x="66" y="82" text-anchor="middle" style="fill:#8E9CB0;font:500 11px var(--f-ui)">${_('milestones', 'معالم')}</text></svg>
    <ul>${v.map(p => `<li><i class="dot" style="background:${col[p.id]}"></i><span>${esc(l(p.name))}</span><b class="num">${p.ms.done} / ${p.ms.total}</b></li>`).join('')}</ul></div>
    <p class="sub" style="margin-top:12px;font-size:12.5px">${l(DEF_MS)}</p></section>`;
}
productsTab = function () {
  const v = visProjects();
  return `<div class="grid"><section class="panel c12" aria-label="${_('Products', 'المنتجات')}">${panelHead('layers', _('Products', 'المنتجات'), {n:v.length})}<div class="pcards">${v.map(richCard).join('')}</div></section>
    ${ringPanel()}${trajPanel().replace('panel c7', 'panel c8')}${methodPanel().replace('panel c5', 'panel c12')}</div>`;
};

function focusPanel() {
  const items = [
    ['f1', ['Approve go/no-go for the pilot release', 'الموافقة على قرار الانطلاق للإصدار التجريبي'], ['Decision', 'قرار'], 'b-gold', 'opendec', 'D1'],
    ['f2', ['Review 2 high-impact changes (sample)', 'مراجعة تغييرين عالييّ الأثر (عينة)'], ['Engineering', 'هندسة'], 'b-teal', null],
    ['f3', ['Confirm the resource plan for load tests', 'تأكيد خطة الموارد لاختبارات الحمل'], ['Management', 'إدارة'], 'b-info', 'opendec', 'D5'],
    ['f4', ['Plan the next Seshat-BI milestone', 'تخطيط معلم Seshat-BI القادم'], ['Product', 'منتج'], 'b-ai', 'opendec', 'D3']
  ];
  const left = items.filter(i => !S.focus[i[0]]).length;
  return `<section class="panel c4" aria-labelledby="h-foc">${panelHead('target', `<span id="h-foc">${_('Focus & Next Actions', 'التركيز والإجراءات التالية')}</span>`, {n:left})}
    <div>${items.map(i => `<div class="chk ${S.focus[i[0]] ? 'done' : ''}"><button role="checkbox" aria-checked="${!!S.focus[i[0]]}" data-act="focus" data-id="${i[0]}" aria-label="${esc(l(i[1]))}">${S.focus[i[0]] ? icon('check', 'sm') : ''}</button>
      ${i[4] ? `<button class="btn-link t" data-act="${i[4]}" data-id="${i[5]}" style="text-align:start;color:var(--ink);font-weight:500">${l(i[1])}</button>` : `<span class="t">${l(i[1])}</span>`}${badge(i[3], l(i[2]))}</div>`).join('')}</div>
    <p class="sub" style="margin-top:10px;font-size:12.5px">${_('Ticks stay in this prototype only.', 'العلامات تبقى في هذا النموذج فقط.')}</p></section>`;
}
function homeTraj() { return trajPanel().replace('panel c7', 'panel c8'); }
ACT.focus = el => { S.focus[el.dataset.id] = !S.focus[el.dataset.id]; renderApp(); };
