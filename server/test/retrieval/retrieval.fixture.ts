// Synthetic memory rows for the COG-03 S1 retrieval tests (BACK-106). No real source, person or data.
// Builds on the COG-02 fixture helpers; titles are overridden to exercise English and Arabic search.
import { project } from '../../src/memory/memory.projector';
import type { MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { at, confPage, ghIssue, jiraIssue, pr, repo, request } from '../memory/memory.fixture';

const o = (id: string, observedAt = at('11:55')) => ({ id, observedAt });

/** A Jira issue row with a chosen summary (the COG-02 helper fixes it to "Synthetic <key>"). */
export const jira = (key: string, summary: string, id: string, updatedAt = at('11:00')): MemoryRow => {
  const row = jiraIssue(key, { updatedAt }, o(id));
  return { ...row, payload: { ...row.payload, summary } };
};

/** The standard visible world: one repository, PRs, an issue, Jira issues and a Confluence page. */
export function worldRows(): MemoryRow[] {
  return [
    repo({}, o('r1')),
    pr(12, { title: 'Fix login timeout for BACK-7', updatedAt: at('11:00') }, o('p12')),
    pr(15, { title: 'إصلاح تسجيل الدخول', updatedAt: at('11:01') }, o('p15')),
    pr(16, { title: 'Refactor login and session handling, follows #12', updatedAt: at('11:02') }, o('p16')),
    pr(20, { title: 'Mentions ISO-9001 and BACK-404 and BACK-7 twice BACK-7', updatedAt: at('11:03') }, o('p20')),
    ghIssue(4, { updatedAt: at('11:04'), title: 'Login page is slow' }, o('i4')),
    jira('BACK-7', 'Session timeout policy', 'j7'),
    jira('BACK-8', 'مراجعة سياسة الجلسة', 'j8'),
    confPage('ENG', '12', { version: 3, lastModified: at('10:00'), title: 'Login runbook' }, o('c12')),
  ];
}

export const projectionOf = (rows: readonly MemoryRow[], evaluationAt = at('12:00')): MemoryProjection =>
  project(rows, request({ evaluationAt }));

export const world = (): MemoryProjection => projectionOf(worldRows());
