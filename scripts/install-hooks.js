#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

if (process.env.CI) process.exit(0);
const root = path.resolve(__dirname, '..');
const gitDir = path.join(root, '.git');
if (!fs.existsSync(gitDir)) process.exit(0);

const hooksDir = path.join(gitDir, 'hooks');
const hook = path.join(hooksDir, 'pre-push');
fs.mkdirSync(hooksDir, { recursive: true });

const content = '#!/bin/sh\nnode scripts/check-js-syntax.js\nstatus=$?\nif [ $status -ne 0 ]; then\n  exit $status\nfi\n';
fs.writeFileSync(hook, content, { mode: 0o755 });
try { fs.chmodSync(hook, 0o755); } catch {}
console.log('Installed Git pre-push JavaScript syntax check.');
