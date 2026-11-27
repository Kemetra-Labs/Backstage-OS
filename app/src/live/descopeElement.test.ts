// The Descope element is built imperatively (live incident 2026-11-27: React 19 assigned the JSX prop `locale` as a DOM
// property, the component defines it as a getter only, and the TypeError blanked /sign-in). These tests pin that every
// attribute is set with setAttribute before the element is returned (so before it is connected), and that no property is set.
import { describe, expect, it } from 'vitest';
import { createDescopeElement } from './descopeElement';

/** A fake element whose `locale` is getter-only, like <descope-wc>: assigning the property throws, as in the browser. */
function fakeDocument() {
  const created: Array<{ tag: string; attrs: Map<string, string> }> = [];
  const doc = {
    createElement(tag: string) {
      const attrs = new Map<string, string>();
      const node = {
        setAttribute: (k: string, v: string) => { attrs.set(k, v); },
        get locale() { return attrs.get('locale') ?? null; },
      };
      created.push({ tag, attrs });
      return node as unknown as HTMLElement;
    },
  };
  return { doc, created };
}

describe('createDescopeElement (D3(a) locale hotfix)', () => {
  it('creates <descope-wc> with all attributes via setAttribute, never by property assignment', () => {
    const { doc, created } = fakeDocument();
    expect(() => createDescopeElement(doc, 'P3MW4c80PMtyApvtGSONYmXy9fGt', 'ar')).not.toThrow();
    expect(created).toHaveLength(1);
    expect(created[0]!.tag).toBe('descope-wc');
    expect(Object.fromEntries(created[0]!.attrs)).toEqual({
      'project-id': 'P3MW4c80PMtyApvtGSONYmXy9fGt',
      'flow-id': 'sign-in',
      'store-last-authenticated-user': 'false',
      locale: 'ar',
    });
  });

  it('passes the English locale through unchanged', () => {
    const { doc, created } = fakeDocument();
    createDescopeElement(doc, 'P3MW4c80PMtyApvtGSONYmXy9fGt', 'en');
    expect(created[0]!.attrs.get('locale')).toBe('en');
  });
});
