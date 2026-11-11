const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interrogate-'));
const exec = (args, input) =>
  execFileSync(process.execPath, [path.join(__dirname, 'hooks', 'interrogate.js'), ...args], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
    encoding: 'utf8',
    input,
  });
const set = (...a) => exec(['set', ...a]);
const sid = `test-${process.pid}`;
const hook = (event, source) => exec([], JSON.stringify({ session_id: sid, hook_event_name: event, source }));

assert.match(set(), /mode: lite/, 'lite by default');
assert.match(hook('SessionStart'), /INTERROGATE LITE ON/, 'rules at session start');
assert.strictEqual(hook('UserPromptSubmit'), '', 'no repeat on later prompts');

set('full'); hook('UserPromptSubmit');
const lite = set('lite');
assert.match(lite, /INTERROGATE LITE ON/, 'set lite');
assert.doesNotMatch(lite, /Multiple valid choices/, 'lite excludes full rules');
assert.match(hook('UserPromptSubmit'), /INTERROGATE LITE ON/, 'mode change reaches session');
assert.strictEqual(hook('UserPromptSubmit'), '', 'then silent');

const ultra = set('ultra');
assert.match(ultra, /Ambiguous wording[\s\S]*Multiple valid choices[\s\S]*Goal and success criteria/, 'ultra includes lite + full');
assert.match(set(), /mode: ultra/, 'mode persists');

assert.match(hook('UserPromptSubmit'), /ULTRA ON/, 'ultra reaches session');
for (let i = 2; i < 6; i++) assert.strictEqual(hook('UserPromptSubmit'), '', `silent on prompt ${i}`);
assert.match(hook('UserPromptSubmit'), /ULTRA still on/, 'reminder on prompt 6');
assert.strictEqual(hook('UserPromptSubmit'), '', 'silent after reminder');

assert.match(set('off'), /INTERROGATE OFF/, 'set off');
assert.match(hook('UserPromptSubmit'), /INTERROGATE OFF/, 'off reported once');
assert.strictEqual(hook('UserPromptSubmit'), '', 'silent while off');
assert.strictEqual(hook('SessionStart'), '', 'silent at start while off');

set('full');
assert.match(hook('SessionStart', 'compact'), /FULL ON/, 'rules again after compact');
assert.strictEqual(hook('SessionStart', 'resume'), '', 'no repeat on resume');
assert.match(set('bogus'), /Usage/, 'rejects unknown mode');
assert.match(set(), /mode: full/, 'bad mode leaves state alone');

fs.rmSync(path.join(os.tmpdir(), `interrogate-${sid}`), { force: true });
fs.rmSync(dir, { recursive: true });
console.log('ok');
