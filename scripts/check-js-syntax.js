#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');

const files = execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);

if (!files.length) {
  console.log('JS syntax check: no tracked JavaScript files found.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

if (failed) {
  console.error(`\nJS syntax check failed: ${failed} file${failed === 1 ? '' : 's'}. Push blocked.`);
  process.exit(1);
}

console.log(`JS syntax check passed: ${files.length} tracked file${files.length === 1 ? '' : 's'}.`);
