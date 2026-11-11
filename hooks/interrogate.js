#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const stateFile = path.join(dir, '.interrogate.json');
const MODES = ['lite', 'full', 'ultra', 'off'];
const DEFAULT = 'full';

const readMode = () => {
  if (MODES.includes(process.env.INTERROGATE_MODE)) return process.env.INTERROGATE_MODE;
  try {
    const m = JSON.parse(fs.readFileSync(stateFile, 'utf8')).mode;
    return MODES.includes(m) ? m : DEFAULT;
  } catch {
    return DEFAULT;
  }
};

const HOW = `How to ask:
- Ask before writing code, editing files or running commands that change anything. Reading and exploring first is fine; look things up yourself instead of asking what the code or docs already answer.
- Use the AskUserQuestion tool when it is available (up to 4 questions per call, 2-4 options each, your recommended option first and marked "(Recommended)"). Otherwise ask in plain text as a short numbered list, each with your recommended answer.
- Batch questions into one round; do not drip them one at a time.
- If the user says "just do it", "use your judgment" or similar, stop asking for that task, state the choices you made in one line, and proceed.
- Small, unambiguous edits (a typo, a rename, a one-line fix, a direct question) need no questions in any mode.`;

const LITE = `- Ambiguous wording: the request can reasonably mean two different things.
- Missing required info: you cannot proceed without a fact only the user has (target, name, credentials location, which repo or file).
- Destructive or irreversible actions: deleting data, overwriting files, force-push, migrations, publishing. Confirm exactly what will be affected.
- Conflicts: the request contradicts existing code, docs or an earlier instruction. Say what conflicts and ask which wins.`;

const FULL = `- Multiple valid choices: whenever there is more than one reasonable approach, library, data shape, file layout or naming, present the options with your recommendation instead of picking silently.
- Scope boundaries: ask what is in and out of scope (tests, docs, edge cases, backwards compatibility) when the request does not say.
- New dependencies: ask before adding any package, service or tool.
- Spec confirmation: before implementing, play back a short spec of what you will build (behavior, files touched, key decisions) and wait for a yes.`;

const ULTRA = `For any task that is not small, also ask about:
- Goal and success criteria: why it is needed, what "done" looks like, and how it will be verified.
- UX and API details: exact names, signatures, UI copy, error messages, output formats.
- Edge cases and errors: empty or invalid input, failures, limits, concurrency.
- Mid-task re-confirmation: stop and ask again whenever the plan changes or you find something unexpected, before continuing.`;

const RULES = {
  lite: `INTERROGATE LITE ON. Ask the user before implementing only in these cases:\n${LITE}\nOtherwise proceed with sensible defaults.\n${HOW}`,
  full: `INTERROGATE FULL ON. Ask the user before implementing in these cases:\n${LITE}\n${FULL}\n${HOW}`,
  ultra: `INTERROGATE ULTRA ON. Ask the user before implementing in these cases:\n${LITE}\n${FULL}\n${ULTRA}\n${HOW}`,
};

const REMINDER = (m) => `INTERROGATE ${m.toUpperCase()} still on: keep following the interrogate rules from the start of this session.`;
const OFF = 'INTERROGATE OFF. The interrogate rules no longer apply; proceed with your normal judgment.';
const EVERY = 6;

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'set') {
  const current = readMode();
  if (!arg) {
    console.log(`interrogate mode: ${current}. Modes: lite, full, ultra, off. Tell the user in one sentence.`);
  } else if (MODES.includes(arg)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: arg }));
    console.log(`${arg === 'off' ? OFF : RULES[arg]}\ninterrogate mode set to ${arg}. Tell the user in one sentence.`);
  } else {
    console.log('Usage: /interrogate [lite|full|ultra|off]. Tell the user in one sentence.');
  }
  return;
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
const mode = readMode();

// Rules go in once per session (and after compact/clear), again when the mode changes, plus a one-line reminder every EVERY prompts.
const marker = input.session_id && path.join(os.tmpdir(), `interrogate-${String(input.session_id).replace(/[^\w-]/g, '')}`);
const fresh = input.hook_event_name === 'SessionStart' && input.source !== 'resume';
let seen = null;
try { if (marker && !fresh) seen = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch {}
const prompts = (seen && seen.mode === mode ? seen.prompts : 0) + (input.hook_event_name === 'UserPromptSubmit' ? 1 : 0);

if (!seen || seen.mode !== mode) {
  if (mode !== 'off') console.log(RULES[mode]);
  else if (seen) console.log(OFF);
} else if (mode !== 'off' && input.hook_event_name === 'UserPromptSubmit' && prompts % EVERY === 0) {
  console.log(REMINDER(mode));
}
if (marker) fs.writeFileSync(marker, JSON.stringify({ mode, prompts }));
