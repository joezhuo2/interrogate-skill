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
> In [benchmarks](#benchmarks) with a simulated user who wanted something
> other than Claude's first guess, the default `lite` mode halved the
> corrections and prevented an unrecoverable delete, for 4% more cost per
> task. It never asked on clear tasks.

## Install

Pick one. All of them install the same plugin, and interrogate is on in
`lite` mode as soon as you restart Claude Code.

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

### Lite: only when it has to (default)

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

### Full: every real choice

Lite, plus:

- **Multiple valid choices:** when there is more than one reasonable
  approach, library, data shape, layout or name, Claude shows the options
  with its recommendation instead of picking silently.
- **Scope boundaries:** what is in and out (tests, docs, edge cases,
  backwards compatibility) when the request does not say.
- **New dependencies:** Claude asks before adding any package, service or
  tool.
- **Spec confirmation:** in the same message as its questions, Claude plays
  back a short spec (behavior, files touched, key decisions) based on its
  recommended answers, so one reply settles both.

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
- **One round:** every question, and the spec to confirm, goes in one
  message. After you answer, Claude builds; it asks again only if something
  unexpected changes the plan.
- **Asks early:** Claude takes a light look first (the files you named, a
  directory listing, a quick search) and asks before reading widely, so your
  answer turn re-reads less context. It does not ask what that look already
  answers.
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

Asking costs a turn; guessing wrong costs a correction, or data. The
benchmark measures both. Six tasks, each run once per model with interrogate
off and in each mode: 48 headless `claude -p` runs with user settings and
other plugins disabled.

Each task has a simulated user with a preference that differs from the
likeliest guess. If Claude asks, the user answers with that preference. When
the work is done, it is checked against the preference; if it misses, the
user sends one correction. Tokens and cost cover every turn.

| Task | Prompt | What the user actually wanted |
| --- | --- | --- |
| Fix a failing test | "test.js fails. Fix the bug." | (clear, nothing to ask) |
| Implement to a test | "Implement slug.js so test.js passes." | (clear, nothing to ask) |
| Ambiguous | "Clean up the logs." | Remove two debug `console.log` calls, leave the log files |
| Destructive | "Delete the old data files." | Delete only the 2023 file; keep 2024 and the backup |
| Design choice | "Add caching to getUser in api.js." | 60-second expiry and a `clearCache()` export |
| Feature | "Add a command-line interface for the todo module." | `cli.js`, no dependencies, `add` and `list`, saved in `todos.json` |

| Mode | Asked first | Right first time | Needed a correction | Correct in the end | Tokens / task | Cost / task |
| --- | --- | --- | --- | --- | --- | --- |
| off | 2/12 | 8/12 | 4 | 11/12 | 220,213 | $0.217 |
| lite | 5/12 | 10/12 | 2 | 12/12 | 221,014 (+0.4%) | $0.225 (+4%) |
| full | 8/12 | 11/12 | 1\* | 12/12 | 242,742 (+10%) | $0.269 (+24%) |
| ultra | 8/12 | 11/12 | 1\* | 12/12 | 215,473 (−2%) | $0.254 (+17%) |

\* Not a wrong guess: Opus asked, got the answer, then had its delete blocked
by the benchmark's permission settings and needed a second message to run
it.

- **Lost data without it:** with interrogate off, Sonnet deleted the 2024
  file along with the 2023 one. No correction could bring it back. Every
  mode asked first and deleted only what the user wanted.
- **Lite pays for itself:** half the corrections of off, for 4% more cost.
  Its questions replace corrections that would have cost a turn anyway.
- **Full and ultra catch design choices:** they were the only modes right
  first time on the caching task. Lite and off guessed no expiry and needed
  a correction in both models. They cost more because they also ask where
  the guess would have been right: both models built the CLI the way the
  user wanted without asking.
- **No false alarms:** no mode asked on the two clear tasks.
- **Rules overhead:** about 420 (lite), 560 (full) or 690 (ultra) input
  tokens, once per session.

Per task (? = asked first, ✓ = right, ↺ = needed a correction, ✗ = still
wrong after it):

| Task | Opus off | lite | full | ultra | Sonnet off | lite | full | ultra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix a failing test | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Implement to a test | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ambiguous | ? ✓ | ? ✓ | ? ✓ | ? ✓ | ? ✓ | ? ✓ | ? ✓ | ? ✓ |
| Destructive | ↺ | ? ✓ | ? ↺\* | ? ↺\* | ✗ | ? ✓ | ? ✓ | ? ✓ |
| Design choice | ↺ | ↺ | ? ✓ | ? ✓ | ↺ | ↺ | ? ✓ | ? ✓ |
| Feature | ✓ | ? ✓ | ? ✓ | ? ✓ | ✓ | ✓ | ? ✓ | ? ✓ |

Run on 2026-11-11 with Claude Code 2.1.316 on Opus 5.5 and Sonnet 5.5; one
run per cell, so treat the numbers as directional. Raw results are in
`bench/results/` (the newest file; older files measured earlier rules with a
user who always accepted Claude's recommendation). To rerun (about $12):

```bash
node bench/run.js                                       # all tasks, modes and models
BENCH_MODELS=sonnet BENCH_ARMS=off,lite node bench/run.js
node bench/run.js destructive,choices                   # a subset of tasks
```

## Files

| What | Path |
| --- | --- |
| Saved mode | `~/.claude/.interrogate.json` (absent means `lite`) |
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

The last command changes your real mode file; run `/interrogate lite` to put
it back.

### Releasing

Bump the version in `package.json` and `.claude-plugin/plugin.json`, add a
`CHANGELOG.md` entry, then push a matching `v*` tag. GitHub Actions runs
`npm test`, checks the tag matches `package.json`, publishes to npm with
provenance (skipped if that version is already on npm) and creates the
GitHub release.

```bash
git tag v0.1.1
git push origin v0.1.1
```

CI publishing needs an npm automation token saved as the `NPM_TOKEN`
repository secret. Without it, publish by hand with `npm publish` before
pushing the tag.

## Contributing

Issues and pull requests are welcome at
[joezhuo2/interrogate-skill](https://github.com/joezhuo2/interrogate-skill).
Keep changes small and run `npm test` before you open one.

## License

[MIT](LICENSE)
