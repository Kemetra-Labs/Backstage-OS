// Imported first by every entry: starts the long-task observer before React runs.
interface KW { longtasks: { start: number; dur: number }[]; ready: boolean; marks: Record<string, number> }
declare global { interface Window { __kw: KW } }
window.__kw = { longtasks: [], ready: false, marks: {} };
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__kw.longtasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
  }).observe({ type: 'longtask', buffered: true });
} catch { /* longtask not supported (e.g. WebKit): reported as NOT SUPPORTED by the check script */ }
export {};
