// Server-side capability matrix (BACK-56). Deny by default. Personas never grant anything.
// Effective permission for source data = role capability AND an active source grant
// (source grants arrive with the evidence slice, BACK-55 S3).

export const CAPABILITIES = [
  'evidence.read',
  'evidence.ingest', // server-internal connector path only; no user role holds it
  'decision.create',
  'note.create', // a user-written Correlation or Hypothesis citing one source's evidence (BACK-50)
  'source.connect',
  'source.disconnect',
  'audit.read',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type Role = 'owner';

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  owner: ['evidence.read', 'decision.create', 'note.create', 'source.connect', 'source.disconnect', 'audit.read'],
};

export function capabilitiesFor(role: Role): readonly Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}
