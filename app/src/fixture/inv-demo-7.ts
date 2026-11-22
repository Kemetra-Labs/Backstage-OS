// Synthetic case INV-DEMO-7 (Blueprint v4 §4). Every value is invented. Keys use RT-DEMO-, links use *.example.invalid.
// The sources, the evidence E-1..E-7 and the three map nodes are canonical facts owned by src/domain (BACK-83): re-exported and
// projected here, not defined here. What stays below is V1's own presentation of the case: its facts list, hypothesis and raw output.
import type { EntityRef, Hypothesis, InvestigationData, MapNode } from '../contract/types';
import { DOMAIN } from '../domain/fixture';
import { EVIDENCE, SOURCES } from '../domain/records';
import { toV1Nodes } from '../domain/toV1';

export { EVIDENCE, SOURCES };

const component: EntityRef = { kind: 'component', id: 'component:stock-sync', label: 'Backend-Core › stock-sync' };

export const HYPOTHESIS: Hypothesis = {
  id: 'H-1',
  confidence: 'medium',
  supporting: [EVIDENCE.checkFailed, EVIDENCE.prMerged],
  contradicting: [EVIDENCE.issueLinked],
};

export const NODES: readonly MapNode[] = toV1Nodes(DOMAIN);

export const RAW_OUTPUT = "AssertionError: expected '2026-11-16T14:00Z' got '2026-11-16T16:00Z'";

export const INV_DEMO_7: InvestigationData = {
  id: DOMAIN.investigationId,
  product: 'Retail Tower OS',
  component,
  environment: 'ci',
  sources: Object.values(SOURCES),
  facts: [
    { key: 'observed', evidence: EVIDENCE.checkFailed },
    { key: 'correlated', evidence: EVIDENCE.issueLinked },
    { key: 'hypothesis', evidence: null },
    { key: 'unknown', evidence: null },
    { key: 'proposed', evidence: null },
  ],
  evidence: Object.values(EVIDENCE),
  hypothesis: HYPOTHESIS,
  nodes: NODES,
  rawOutput: { evidenceId: 'E-1', text: RAW_OUTPUT },
  startedMinutesAgo: 6,
};
