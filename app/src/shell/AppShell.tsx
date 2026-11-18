import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { Text } from '../components/Text';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Skip link, top bar, navigation, the one <main> landmark and the footer. Screens render inside <main>. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const { copy, shell, route } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the narrow-screen menu after any navigation.
  useEffect(() => { setMenuOpen(false); }, [route]);

  return (
    <>
      {/* A plain "#main" href would change the hash route, so the skip link moves focus itself. */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}
      >
        {copy.skip}
      </a>
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} />
      <div className="layout">
        <Sidebar open={menuOpen} />
        <main id="main" tabIndex={-1} data-route={route.name}>
          {children}
        </main>
      </div>
      <footer className="foot"><p className="note"><Text s={shell.footer} /></p></footer>
    </>
  );
}
