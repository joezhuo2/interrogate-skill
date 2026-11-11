# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-11-11

### Added

- Three modes that set when Claude asks before implementing: `lite` (ambiguity, missing info, destructive actions, conflicts), `full` (adds multiple choices, scope, new dependencies and a spec confirmation) and `ultra` (adds goals, UX/API details, edge cases and mid-task re-confirmation for any non-small task).
- `/interrogate [lite|full|ultra|off]` sets the mode for every session; no argument shows the current one. Default is `full`.
- npx / npm installer, benchmark script and self-test.
