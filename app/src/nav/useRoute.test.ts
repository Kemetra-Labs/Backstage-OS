import { describe, expect, it } from 'vitest';
import { screenKey } from './useRoute';

describe('screenKey', () => {
  it('ignores in-screen selection and distinguishes screens', () => {
    expect(screenKey({ name: 'project', projectId: 'RT' })).toBe(screenKey({ name: 'project', projectId: 'RT', componentId: 'stock-sync' }));
    expect(screenKey({ name: 'project', projectId: 'RT' })).not.toBe(screenKey({ name: 'project', projectId: 'KH' }));
    expect(screenKey({ name: 'evidence', id: 'E-1', from: 'INV-DEMO-7' })).toBe('evidence:E-1');
    expect(screenKey({ name: 'decision', id: 'D' })).toBe('decision:D');
    expect(screenKey({ name: 'investigation', id: 'I' })).toBe('investigation:I');
    expect(screenKey({ name: 'notFound', path: '/x' })).toBe('notFound:/x');
    expect(screenKey({ name: 'home' })).toBe('home');
  });
});
