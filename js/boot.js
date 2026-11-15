/* Boot: restore preferences, wire events, first render with a short loading state. */
(function () {
  initState(); restore();
  $('#sprite').innerHTML = sprite();
  const h = location.hash.slice(1); if (ROUTES.includes(h)) S.route = h;
  try { // review hook: ?s={"persona":"tech","tab":{"inv":"evidence"}} seeds state for screenshots
    const sq = new URLSearchParams(location.search).get('s');
    if (sq) { const o = JSON.parse(sq); ['lang', 'persona', 'project', 'src', 'inv', 'dsel', 'node', 'dfilter'].forEach(k => { if (o[k] != null) S[k] = o[k]; }); if (o.tab) Object.assign(S.tab, o.tab); if (o.open) setTimeout(() => ACT[o.open.act]({dataset:o.open}), 900); }
  } catch (e) {}
  wire();
  S.loading = true; renderApp();
  setTimeout(() => { S.loading = false; S.animate = true; renderApp(); }, 650);
})();
