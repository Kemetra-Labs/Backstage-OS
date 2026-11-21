// Archify page: the generated HTML is shown ONLY inside <iframe sandbox="allow-scripts"> (no allow-same-origin),
// served from a second localhost origin with its own CSP header. It is never loaded top-level in the harness origin.
import { useEffect, useState } from 'react';
import type { CanvasProps } from '../shared/Shell';

interface Entry { status: 'generated' | 'not-generated'; file?: string; scope?: string; reason?: string; diagnostics?: number }
export const ARCHIFY_ORIGIN = 'http://127.0.0.1:5191';

export function ArchifyCanvas({ datasetKey, fileParam }: CanvasProps) {
  const [manifest, setManifest] = useState<Record<string, Entry> | null>(null);
  useEffect(() => { fetch('/data/archify-manifest.json').then((r) => r.json()).then(setManifest).catch(() => setManifest({})); }, []);
  if (!manifest) return <p className="note">...</p>;
  const entry = manifest[datasetKey];
  const file = fileParam ?? entry?.file;
  if (!file || (!fileParam && entry?.status !== 'generated')) {
    return (
      <div className="arch-none" data-testid="archify-none" role="status">
        <p><strong>NOT GENERATED</strong> for <bdi dir="ltr">{datasetKey}</bdi>.</p>
        <p className="note">{entry?.reason ?? 'no manifest entry'}</p>
      </div>
    );
  }
  return (
    <div className="arch-wrap">
      {entry?.scope && !fileParam && <p className="note arch-scope" data-testid="archify-scope">{entry.scope}</p>}
      <iframe
        title="Archify generated diagram (sandboxed)"
        data-testid="archify-frame"
        src={`${ARCHIFY_ORIGIN}/out/${file}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', minHeight: 440, border: 0, background: '#fff' }}
      />
    </div>
  );
}
