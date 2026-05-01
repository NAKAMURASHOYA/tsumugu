module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  // .ts 拡張子付きのインポート（Denoスタイル）をJest互換に解決する
  moduleNameMapper: {
    '^(.*)\\.ts$': '$1',
  },
};
