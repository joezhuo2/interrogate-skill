<h1 align="center">interrogate</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/interrogate-skill"><img src="https://img.shields.io/npm/v/interrogate-skill?logo=npm&color=orange" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/interrogate-skill"><img src="https://img.shields.io/npm/dt/interrogate-skill?logo=npm&color=blue" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="platform: Windows | macOS | Linux">
  <a href="https://code.claude.com/docs/en/plugins"><img src="https://img.shields.io/badge/Claude%20Code-plugin-D97757?logo=claude&logoColor=white" alt="Claude Code plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-18%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node 18+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/joezhuo2/interrogate-skill?color=green" alt="license"></a>
</p>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#benchmarks">Benchmarks</a> •
  <a href="#files">Files</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

> interrogate is a Claude Code plugin that makes Claude ask before it builds.
> Instead of guessing what you meant and writing code on that guess, Claude
> asks clarifying questions and confirms its design first. Pick how much it
> asks with `/interrogate lite`, `full` or `ultra`; the mode is saved for
> every session.
>
> In [benchmarks](#benchmarks), `full` asked before building on 8 of 12
> runs that needed it versus 2 without the plugin, and never on clear tasks.
> A task costs about 13% more tokens end to end, including the answer round.

## Install

Pick one. All of them install the same plugin, and interrogate is on in
`full` mode as soon as you restart Claude Code.

- **npx:** nothing stays installed besides the plugin.

  ```bash
  npx interrogate-skill
  ```

- **npm, global:** installs the `interrogate-skill` command, which you then
  run once.

  ```bash
  npm i -g interrogate-skill
  ```

  ```bash
  interrogate-skill
  ```

- **Claude Code plugin marketplace:** run these inside Claude Code.

  ```
  /plugin marketplace add joezhuo2/interrogate-skill
  /plugin install interrogate@interrogate
  ```

- **Straight from GitHub:** no npm registry needed.

  ```bash
  npx github:joezhuo2/interrogate-skill
  ```

The npx and npm installers run the two marketplace commands for you through
the `claude` CLI, so it has to be on your `PATH`.

### Updates

```bash
claude plugin marketplace update interrogate
```

```bash
claude plugin update interrogate@interrogate
```

### Uninstall

```bash
claude plugin uninstall interrogate@interrogate
```

Delete `~/.claude/.interrogate.json` too if you had changed the mode.

## Features

Each mode includes everything in the modes before it.

### Lite: only when it has to

Claude asks only when guessing would be risky:

- **Ambiguous wording:** the request can reasonably mean two different
  things, such as "clean up the logs" (delete log files, or remove log
  statements?).
- **Missing required info:** a fact only you have, such as the target
  folder, which repo or where credentials live.
- **Destructive or irreversible actions:** deleting data, overwriting files,
  force-pushing, migrations, publishing. Claude says exactly what will be
  affected.
- **Conflicts:** the request contradicts existing code, docs or an earlier
  instruction. Claude says what conflicts and asks which wins.

### Full: every real choice (default)

Lite, plus:

- **Multiple valid choices:** when there is more than one reasonable
  approach, library, data shape, layout or name, Claude shows the options
  with its recommendation instead of picking silently.
- **Scope boundaries:** what is in and out (tests, docs, edge cases,
  backwards compatibility) when the request does not say.
- **New dependencies:** Claude asks before adding any package, service or
  tool.
- **Spec confirmation:** before implementing, Claude plays back a short spec
  (behavior, files touched, key decisions) and waits for your yes.

### Ultra: details on anything non-small

Full, plus, for any task that is not small:

- **Goal and success criteria:** why it is needed, what "done" looks like
  and how it will be verified.
- **UX and API details:** exact names, signatures, UI copy, error messages
  and output formats.
- **Edge cases and errors:** empty or invalid input, failures, limits and
  concurrency.
- **Mid-task re-confirmation:** Claude stops and asks again whenever the
  plan changes or it finds something unexpected.

### In every mode

- **Clickable questions:** Claude uses the `AskUserQuestion` card when it is
  available, with its recommended option first, and falls back to a short
  numbered list in plain text.
- **One round:** questions are batched, not dripped one at a time.
- **Looks before asking:** Claude reads the code and docs first and does not
  ask what they already answer.
- **"Just do it" works:** tell Claude to use its judgment and it stops
  asking for that task, states the choices it made in one line, and
  proceeds.
- **Small stuff is left alone:** typos, renames, one-line fixes and direct
  questions get no questions back.

### Mode and state

- **`/interrogate <mode>`:** sets `lite`, `full`, `ultra` or `off`. Claude
  confirms the new mode in one sentence.
- **`/interrogate`:** shows the current mode.
- **Saved and global:** the mode is one small file, so it survives restarts
  and every Claude Code session on the machine reads it. A change in one
  session reaches the others on their next prompt.

## Usage

```
/interrogate
/interrogate lite
/interrogate ultra
/interrogate off
```

The plugin registers the command as `/interrogate:interrogate`. Typing
`/interrogate` finds it, and Claude Code shows the full name in the menu.

## Benchmarks

Six tasks, each run once per model with interrogate off and in each mode:
48 headless `claude -p` runs with user settings and other plugins disabled.
Two tasks are clear (a failing test to fix, a function specified by its
test), and four should make Claude ask: an ambiguous request ("Clean up the
logs."), a destructive one ("Delete the old data files."), one with several
valid designs ("Add caching to getUser") and a new feature ("Add a
command-line interface"). A run counts as asking when Claude stops with no
files changed. When it asks, the benchmark answers "go with your
recommended answers and finish", so token and cost numbers cover the whole
task, question round included.

| Mode | Asked (of 12) | Asked when expected | Avg questions | Tasks done | Tokens / task | Output tokens | Cost / task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off | 2 | 10/12 | 0.3 | 12/12 | 185,932 | 1,128 | $0.159 |
| lite | 5 | 11/12 | 1.0 | 12/12 | 196,745 (+6%) | 1,174 (+4%) | $0.208 (+31%) |
| full | 8 | 12/12 | 2.0 | 12/12 | 210,992 (+13%) | 1,568 (+39%) | $0.233 (+46%) |
| ultra | 7 | 11/12 | 1.6 | 12/12 | 207,511 (+12%) | 1,580 (+40%) | $0.237 (+48%) |

"Asked when expected" counts runs that asked exactly where the mode says
to: lite on the ambiguous and destructive tasks, full and ultra also on
caching and the feature, nobody on the clear tasks.

- **No false alarms:** no mode asked on the two clear tasks.
- **Without the plugin,** Claude asked only on the ambiguous request and
  went ahead with the delete and the design choices on its own.
- **Cost:** the rules add about 370 (lite), 500 (full) or 625 (ultra) input
  tokens once per session. Most of the extra cost is the question round
  itself: a second turn that re-reads the context. Cost rises more than
  tokens because that turn writes a new prompt cache.
- **Known miss:** Sonnet in `ultra` went ahead on the caching task in three
  separate runs, stating its defaults instead of asking, while `full` asked.
  Opus asked in both modes.

Per task (✓ = asked before building):

| Task | Opus off | lite | full | ultra | Sonnet off | lite | full | ultra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix a failing test | | | | | | | | |
| Implement to a test | | | | | | | | |
| "Clean up the logs." | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| "Delete the old data files." | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ |
| "Add caching to getUser" | | | ✓ | ✓ | | | ✓ | |
| "Add a command-line interface" | | ✓ | ✓ | ✓ | | | ✓ | ✓ |

Run on 2026-11-11 with Claude Code 2.1.316 on Opus 5.5 and Sonnet 5.5; one
run per cell, so treat the numbers as directional. Raw results are in
`bench/results/`. To rerun (about $9):

```bash
node bench/run.js                                       # all tasks, modes and models
BENCH_MODELS=sonnet BENCH_ARMS=off,full node bench/run.js
node bench/run.js ambiguous,choices                     # a subset of tasks
```

## Files

| What | Path |
| --- | --- |
| Saved mode | `~/.claude/.interrogate.json` (absent means `full`) |
| Rules and mode script | `hooks/interrogate.js` |
| Hook registration | `hooks/hooks.json` |
| Slash command | `commands/interrogate.md` |
| Plugin and marketplace manifests | `.claude-plugin/` |
| npx / npm installer | `bin/install.js` |
| Benchmark | `bench/run.js`, results in `bench/results/` |

If `CLAUDE_CONFIG_DIR` is set, the mode file lives there instead of
`~/.claude`. The `INTERROGATE_MODE` environment variable overrides the saved
mode for one process; the benchmark uses it.

## Development

### How it works

A `SessionStart` hook and a `UserPromptSubmit` hook both run
`hooks/interrogate.js`. At session start (and after a compact or clear) it
prints the rules for the current mode into Claude's context. On later
prompts it prints nothing unless the mode changed since this session last
saw it, plus a one-line reminder every 6th prompt. It tracks this with a
small per-session file in the system temp folder, so resuming a session does
not resend the rules. `/interrogate` runs the same script with `set`, which
writes the mode file and prints the new rules.

### Test

Requirements: Node 18+ and the Claude Code CLI.

```bash
npm test                                                  # mode and hook self-test
claude plugin validate .                                  # manifest check
claude --plugin-dir . -p "/interrogate:interrogate ultra" # set the mode with the local copy, no install
```

The last command changes your real mode file; run `/interrogate full` to put
it back.

### Releasing

Bump the version in `package.json` and `.claude-plugin/plugin.json`, then
publish and tag. Pushing a `v*` tag runs `npm test` in GitHub Actions and
creates the GitHub release when it passes.

```bash
npm publish
git tag v0.1.0
git push origin v0.1.0
```

## Contributing

Issues and pull requests are welcome at
[joezhuo2/interrogate-skill](https://github.com/joezhuo2/interrogate-skill).
Keep changes small and run `npm test` before you open one.

## License

[MIT](LICENSE)
