import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDERER, rendererFrom } from './rendererFlag';

describe('rendererFrom (BACK-82 feature flag)', () => {
  it('defaults to the in-house DepGraph', () => {
    expect(DEFAULT_RENDERER).toBe('depgraph');
    expect(rendererFrom('')).toBe('depgraph');
    expect(rendererFrom('?persona=technical&lang=ar')).toBe('depgraph');
  });

  it('enables React Flow only for an explicit renderer=flow', () => {
    expect(rendererFrom('?renderer=flow')).toBe('flow');
    expect(rendererFrom('?persona=owner&renderer=flow&lang=en')).toBe('flow');
  });

  it('treats every other value as the default, never as an error', () => {
    for (const bad of ['?renderer=', '?renderer=FLOW', '?renderer=reactflow', '?renderer=flow%20', '?renderer=depgraph', '?renderer=1', '?renderer=flow,x']) {
      expect(rendererFrom(bad), bad).toBe('depgraph');
    }
  });
});
