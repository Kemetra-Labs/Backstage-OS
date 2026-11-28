// Test-only: a throwaway RSA key pair generated at runtime (BACK-52 slice A). No key file exists anywhere.
import { createPrivateKey, type KeyObject } from 'node:crypto';
import { exportPKCS8, generateKeyPair } from 'jose';

export interface TestKey {
  /** PKCS#8 PEM, the form a config value carries. */
  readonly pem: string;
  /** PKCS#1 PEM ("BEGIN RSA PRIVATE KEY"), the form GitHub issues. */
  readonly pkcs1: string;
  readonly publicKey: KeyObject;
}

export async function makeTestKey(): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const pem = await exportPKCS8(privateKey);
  const pkcs1 = createPrivateKey(pem).export({ type: 'pkcs1', format: 'pem' }).toString();
  return { pem, pkcs1, publicKey: publicKey as KeyObject };
}
