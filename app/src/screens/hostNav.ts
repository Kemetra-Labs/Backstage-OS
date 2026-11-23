// The host's one way to go somewhere for a lens: a hash change, which the host router (nav/useRoute) already listens to.
import { hrefFor, type Route } from '../nav/routes';

export const navigate = (r: Route): void => { window.location.hash = hrefFor(r); };
