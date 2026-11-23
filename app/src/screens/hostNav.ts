// The host's one way to go somewhere for a lens: a hash change, which the host router (nav/useRoute) already listens to.
import { hrefFor, type Route } from '../nav/routes';

export const navigate = (r: Route): void => { window.location.hash = hrefFor(r); };

/** Replaces the current history entry. replaceState raises no hashchange, so the host router is told explicitly. */
export const replace = (r: Route): void => {
  window.history.replaceState(null, '', `${window.location.search}${hrefFor(r)}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};
