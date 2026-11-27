// Typing for the <descope-wc> custom element that src/live/signInPage.tsx renders (the Descope web component, loaded only in live mode).
// Its attributes are plain strings; the element's own types are not pulled in, so nothing here names the package.
import 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'descope-wc': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'project-id'?: string;
        'flow-id'?: string;
        'store-last-authenticated-user'?: string;
        /** Form language: 'en' or 'ar' (BaseDescopeWc.js observedAttributes). */
        locale?: string;
      };
    }
  }
}
