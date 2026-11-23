// Auth configuration from the environment. Names only appear in errors, never values.
// Rules: a value that is set but malformed always throws at boot. A value that is missing throws in
// production; elsewhere it leaves auth "unconfigured", where every protected request is denied and nothing
// reaches the network. KAWALYS_* names only: no Retail Tower DESCOPE_* variable is read.
import { DESCOPE_PROVIDER_KEY, PROJECT_ID_RE, descopeIssuer } from "./identity/descope-verifier";
import type { OwnerIdentity } from "./identity/identity-directory";

export class AuthConfigError extends Error {}

export type Env = Readonly<Record<string, string | undefined>>;

export interface DescopeSettings {
  readonly projectId: string;
  readonly issuer: string;
  readonly maxTokenAgeSeconds: number;
}

export interface SessionSettings {
  readonly absoluteTtlSeconds: number;
  readonly idleTtlSeconds: number;
}

export interface AuthConfig {
  readonly production: boolean;
  readonly descope: DescopeSettings | null;
  readonly owner: OwnerIdentity | null;
  readonly session: SessionSettings;
  readonly signInLimitPerMinute: number;
  /** The loopback owner-lab sign-in page (GET /auth/lab). Never true in production. */
  readonly lab: boolean;
}

export const DEFAULT_MAX_TOKEN_AGE_SECONDS = 15 * 60;
export const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 8 * 60 * 60;
export const DEFAULT_SESSION_IDLE_TTL_SECONDS = 60 * 60;
export const DEFAULT_SIGN_IN_LIMIT_PER_MINUTE = 10;

const OWNER_SUBJECT_RE = /^[A-Za-z0-9_-]{1,128}$/;
const ISSUER_URL_RE = /^https:\/\/\S{1,500}$/;

function read(env: Env, name: string): string {
  return (env[name] ?? "").trim();
}

function intFrom(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name);
  if (raw === "") return fallback;
  const value = /^\d{1,7}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= min && value <= max)) {
    throw new AuthConfigError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function loadDescope(env: Env): DescopeSettings | null {
  const projectId = read(env, "KAWALYS_DESCOPE_PROJECT_ID");
  const issuerOverride = read(env, "KAWALYS_DESCOPE_ISSUER");
  if (projectId === "") {
    if (issuerOverride !== "") throw new AuthConfigError("KAWALYS_DESCOPE_ISSUER needs KAWALYS_DESCOPE_PROJECT_ID");
    return null;
  }
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new AuthConfigError("KAWALYS_DESCOPE_PROJECT_ID is malformed (expected an alphanumeric project id)");
  }
  if (issuerOverride !== "" && !ISSUER_URL_RE.test(issuerOverride)) {
    throw new AuthConfigError("KAWALYS_DESCOPE_ISSUER must be an https URL");
  }
  return {
    projectId,
    issuer: issuerOverride !== "" ? issuerOverride : descopeIssuer(projectId),
    maxTokenAgeSeconds: intFrom(env, "KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS", DEFAULT_MAX_TOKEN_AGE_SECONDS, 60, 3600),
  };
}

function loadLab(env: Env, production: boolean): boolean {
  const raw = read(env, "KAWALYS_AUTH_LAB");
  if (raw === "") return false;
  if (raw !== "1") throw new AuthConfigError("KAWALYS_AUTH_LAB must be 1 (or unset)");
  if (production) throw new AuthConfigError("KAWALYS_AUTH_LAB is refused in production");
  return true;
}

function loadSession(env: Env): SessionSettings {
  const absoluteTtlSeconds = intFrom(
    env,
    "KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS",
    DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
    300,
    24 * 60 * 60,
  );
  const idleTtlSeconds = intFrom(env, "KAWALYS_SESSION_IDLE_TTL_SECONDS", DEFAULT_SESSION_IDLE_TTL_SECONDS, 60, absoluteTtlSeconds);
  return { absoluteTtlSeconds, idleTtlSeconds };
}

export function loadAuthConfig(env: Env): AuthConfig {
  const production = env["NODE_ENV"] === "production";
  // Before the production completeness check, so a production lab flag is always reported as the lab error.
  const lab = loadLab(env, production);
  const descope = loadDescope(env);
  const subject = read(env, "KAWALYS_OWNER_SUBJECT");
  if (subject !== "" && !OWNER_SUBJECT_RE.test(subject)) {
    throw new AuthConfigError("KAWALYS_OWNER_SUBJECT is malformed (expected the owner's Descope user id)");
  }
  const session = loadSession(env);
  if (production && (descope === null || subject === "")) {
    throw new AuthConfigError("KAWALYS_DESCOPE_PROJECT_ID and KAWALYS_OWNER_SUBJECT are required in production");
  }
  const owner: OwnerIdentity | null =
    descope !== null && subject !== "" ? { providerKey: DESCOPE_PROVIDER_KEY, issuer: descope.issuer, subject } : null;
  const signInLimitPerMinute = intFrom(env, "KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE", DEFAULT_SIGN_IN_LIMIT_PER_MINUTE, 1, 100);
  return { production, descope, owner, session, signInLimitPerMinute, lab };
}
