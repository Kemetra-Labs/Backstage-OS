import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { agentEvents, agentRoster, projectFilterOptions, stateCounts } from './agentView';

describe('agentRoster', () => {
  const rows = agentRoster(WORLD);

  it('lists every agent with its state and project names', () => {
    expect(rows.map((r) => r.name)).toEqual(['triage-scout', 'evidence-collector', 'release-guard', 'remediation']);
    expect(rows.find((r) => r.name === 'triage-scout')?.projects.map((p) => p.name)).toEqual(['Retail Tower OS', 'Khepri']);
  });

  it('keeps remediation not enabled, with no projects, no activity and only unavailable capabilities', () => {
    const r = rows.find((x) => x.name === 'remediation');
    expect(r?.state).toBe('not_enabled');
    expect(r?.projects).toEqual([]);
    expect(r?.lastActivityMinutesAgo).toBeNull();
    expect(r?.capabilities.every((c) => c.status === 'not_available')).toBe(true);
  });

  it('ignores unknown project ids instead of inventing names', () => {
    const w = { ...WORLD, agents: [{ ...WORLD.agents[0]!, projectIds: ['ZZ' as never, 'RT' as const] }] };
    expect(agentRoster(w)[0]?.projects.map((p) => p.id)).toEqual(['RT']);
  });

  it('counts states', () => {
    expect(stateCounts(rows)).toEqual({ watching: 2, idle: 0, paused: 1, not_enabled: 1 });
  });
});

describe('agentEvents', () => {
  it('returns agent events plus the human pause, newest first, never source events', () => {
    const e = agentEvents(WORLD);
    expect(e.map((x) => x.id)).toEqual(['ACT-4', 'ACT-5', 'ACT-3', 'ACT-6', 'ACT-8']);
    expect(e.every((x) => x.minutesAgo >= 0)).toBe(true);
    expect(e.map((x) => x.minutesAgo)).toEqual([...e.map((x) => x.minutesAgo)].sort((a, b) => a - b));
  });

  it('carries the agent name, truth and links', () => {
    const e = agentEvents(WORLD);
    expect(e.find((x) => x.id === 'ACT-4')).toMatchObject({ agentName: 'evidence-collector', truth: 'correlated', evidenceId: 'E-3', investigationId: null });
    expect(e.find((x) => x.id === 'ACT-3')).toMatchObject({ agentName: 'triage-scout', truth: 'proposed', investigationId: 'INV-DEMO-7' });
    expect(e.find((x) => x.id === 'ACT-8')).toMatchObject({ actor: 'human', agentName: 'release-guard' });
  });

  it('never labels anything Approved', () => {
    expect(agentEvents(WORLD).some((x) => x.truth === 'approved')).toBe(false);
  });

  it('filters by project', () => {
    expect(agentEvents(WORLD, 'KH').map((x) => x.id)).toEqual(['ACT-6']);
    expect(agentEvents(WORLD, 'SB')).toEqual([]);
  });

  it('shows a null agent name when the event has no known agent', () => {
    const w = { ...WORLD, activity: [{ ...WORLD.activity[2]!, agentId: 'AG-none' }] };
    expect(agentEvents(w)[0]?.agentName).toBeNull();
  });
});

describe('projectFilterOptions', () => {
  it('offers only projects that have agent events', () => {
    expect(projectFilterOptions(WORLD).map((p) => p.id)).toEqual(['RT', 'KH']);
  });
});
