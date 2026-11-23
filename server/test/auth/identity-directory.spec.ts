import { ConfiguredOwnerDirectory, OWNER_USER_ID } from '../../src/auth/identity/identity-directory';

const OWNER = { providerKey: 'descope', issuer: 'https://api.descope.com/v1/apps/PkawalysTest0001', subject: 'UkawalysOwner0001' };

describe('ConfiguredOwnerDirectory', () => {
  const directory = new ConfiguredOwnerDirectory(OWNER);

  it('resolves the exact configured triple to the owner, with a provider-independent user id', async () => {
    await expect(directory.resolve({ ...OWNER })).resolves.toEqual({ userId: OWNER_USER_ID, role: 'owner' });
  });

  it.each([
    ['a different subject', { subject: 'UsomeoneElse' }],
    ['the same subject from a foreign issuer', { issuer: 'https://api.descope.com/v1/apps/P2rtProject0001' }],
    ['the same subject from another provider', { providerKey: 'clerk' }],
    ['an empty subject', { subject: '' }],
  ])('denies %s', async (_label, change) => {
    await expect(directory.resolve({ ...OWNER, ...change })).resolves.toBeNull();
  });

  it('denies everyone when no owner is configured', async () => {
    await expect(new ConfiguredOwnerDirectory(null).resolve({ ...OWNER })).resolves.toBeNull();
  });
});
