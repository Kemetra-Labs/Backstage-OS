import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { buildIndex, search } from '../nav/search';

/** Searches the synthetic world only. Results are plain route links; nothing is fetched. */
export function DemoSearch() {
  const { persona, lang, shell, world } = useApp();
  const index = useMemo(() => buildIndex(world), [world]);
  const [q, setQ] = useState('');
  const results = search(index, q, persona, lang);
  const open = q.trim().length >= 2;

  return (
    <div className="search" role="search">
      <label htmlFor="demo-search" className="vh">{shell.search.label}</label>
      <input
        id="demo-search"
        type="search"
        value={q}
        placeholder={shell.search.placeholder}
        autoComplete="off"
        // Only reference the results list while it exists; a dangling id is invalid ARIA (axe, BACK-91).
        aria-controls={open ? 'demo-search-results' : undefined}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }}
      />
      <p className="vh" aria-live="polite">{open ? (results.length ? shell.search.results(results.length) : shell.search.none) : ''}</p>
      {open && (
        <div className="search-pop" id="demo-search-results">
          {results.length === 0 ? (
            <p className="note">{shell.search.none}</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={`${r.kind}:${r.id}`}>
                  <a href={r.href} onClick={() => setQ('')}>
                    <span className="search-kind">{shell.search.kind[r.kind]}</span>
                    <bdi dir="ltr" className="ltr">{r.label}</bdi>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
