#!/usr/bin/env node
'use strict';

// Static guard for SECURITY DEFINER function headers in active Supabase SQL.
// Effective ACLs must also be checked against the deployed database with
// supabase/tests/security-definer-audit.sql.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sqlDir = path.join(root, 'supabase');
const files = fs.readdirSync(sqlDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, source: fs.readFileSync(path.join(sqlDir, name), 'utf8') }));

const failures = [];
let definerCount = 0;
const escapeRegex = (value) => value.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');

for (const file of files) {
  const functionHeader = /create\s+(?:or\s+replace\s+)?function\s+((?:public\.)?[a-z_][a-z0-9_$]*)\s*\([\s\S]*?\bas\s+\$(?:function)?\$/gi;
  let match;
  while ((match = functionHeader.exec(file.source)) !== null) {
    const header = match[0];
    if (!/\bsecurity\s+definer\b/i.test(header)) continue;
    definerCount += 1;
    const functionName = match[1].replace(/^public\./i, '').toLowerCase();

    if (!/\bset\s+search_path\s*(?:=|to)\s*[^;]+/i.test(header)) {
      failures.push(`${file.name}: ${functionName} is SECURITY DEFINER without a fixed SET search_path`);
    }
    if (/\bsearch_path\b[^;]*(?:\$user|pg_temp)/i.test(header)) {
      failures.push(`${file.name}: ${functionName} uses a dynamic or temporary schema in search_path`);
    }

    // The canonical schema has a broad revoke before later definitions and
    // per-routine revokes for functions created later in the file. Migrations
    // need their own revoke because a newly created function defaults to PUBLIC EXECUTE.
    const suffix = file.source.slice(match.index + header.length);
    const hasBroadCanonicalRevoke = file.name === 'schema.sql'
      && /revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(suffix);
    const hasRoutineRevoke = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${escapeRegex(functionName)}\\s*\\(`,
      'i'
    ).test(suffix);
    if (!hasBroadCanonicalRevoke && !hasRoutineRevoke) {
      failures.push(`${file.name}: ${functionName} has no subsequent EXECUTE revoke in this source file`);
    }
  }
}

if (definerCount === 0) {
  failures.push('No SECURITY DEFINER definitions were found; check the SQL scanner.');
}

if (failures.length) {
  console.error('SECURITY DEFINER source audit FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`SECURITY DEFINER source audit passed: ${definerCount} definitions across ${files.length} active Supabase SQL files have fixed search_path declarations and a visible subsequent EXECUTE revoke.`);
  console.log('Effective grants and schema CREATE privileges still require the catalog audit SQL against the target database.');
}
