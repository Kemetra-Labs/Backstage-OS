// Builds the Descope element imperatively (D3(a) hotfix, live incident 2026-11-27). React 19 assigns a JSX prop on a custom
// element as a DOM property whenever the element already has a property of that name; <descope-wc> defines `locale` as a
// getter only, so `locale={...}` in JSX threw a TypeError and blanked /sign-in. Here every attribute is set with setAttribute
// before the element is returned, so it is connected with its configuration complete. Imported only by signInPage.tsx (so the
// fixture build, which drops that page, never contains it).

/** The `locale` values the page passes: 'en' or 'ar' only. */
export type DescopeElementLocale = 'en' | 'ar';

export function createDescopeElement(
  doc: Pick<Document, 'createElement'>,
  projectId: string,
  locale: DescopeElementLocale,
): HTMLElement {
  const node = doc.createElement('descope-wc');
  node.setAttribute('project-id', projectId);
  node.setAttribute('flow-id', 'sign-in');
  node.setAttribute('store-last-authenticated-user', 'false');
  node.setAttribute('locale', locale);
  return node;
}
