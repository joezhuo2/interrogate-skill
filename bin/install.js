#!/usr/bin/env node
const { execSync } = require('child_process');

for (const cmd of [
  'claude plugin marketplace add joezhuo2/interrogate-skill',
  'claude plugin install interrogate@interrogate',
]) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    console.error(`Failed: ${cmd}. Is the Claude Code CLI installed and on PATH?`);
    process.exit(1);
  }
}
console.log('interrogate is installed in lite mode. Restart Claude Code, then use /interrogate lite|full|ultra|off.');
