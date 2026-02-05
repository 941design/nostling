module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/scripts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', 'crypto.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true, allowSyntheticDefaultImports: true, resolveJsonModule: true } }],
    // Transform ESM-only packages
    '^.+\\.(js|mjs)$': ['ts-jest', { useESM: true }],
  },
  // Include ESM packages in transformation (not ignored)
  transformIgnorePatterns: [
    'node_modules/(?!(nostr-tools|@noble|@scure)/)',
  ],
};
