// Local identity boundary. A verified provider subject is not access: it must resolve to exactly one
// enabled local user, and that user carries the role. Provider claims (admin, email, groups) grant nothing.
// Today the directory holds the one explicitly configured owner. A database-backed directory (BACK-55) or a
// second user replaces this class; the guard, the sessions and the port do not change.
import type { VerifiedSubject } from "./identity-verification.port";

export type Role = "owner";

/** The local user id is stable and independent of the provider, so a provider switch keeps sessions' owner. */
export interface LocalUser {
  readonly userId: string;
  readonly role: Role;
}

export interface IdentityDirectory {
  /** Resolves a verified provider subject to its local user, or null (unknown, disabled or not the owner). */
  resolve(subject: VerifiedSubject): Promise<LocalUser | null>;
}

export const OWNER_USER_ID = "kawalys-owner";

/** The one identity link. All three parts must match; matching on the subject alone would accept a foreign issuer. */
export type OwnerIdentity = VerifiedSubject;

export class ConfiguredOwnerDirectory implements IdentityDirectory {
  constructor(private readonly owner: OwnerIdentity | null) {}

  resolve(subject: VerifiedSubject): Promise<LocalUser | null> {
    const o = this.owner;
    const match =
      o !== null &&
      o.providerKey === subject.providerKey &&
      o.issuer === subject.issuer &&
      o.subject === subject.subject;
    return Promise.resolve(match ? { userId: OWNER_USER_ID, role: "owner" } : null);
  }
}
