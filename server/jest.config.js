// Nest 12 ships ESM only. Jest runs the TypeScript sources as ES modules
// (needs node --experimental-vm-modules, set in the "test" script).
module.exports = {
  testEnvironment: 'node',
  // `roots` + a relative glob: an absolute `<rootDir>` glob breaks on Windows paths
  // that contain `\.` (for example a `.claude\worktrees\...` checkout).
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.test.json' }] },
};
