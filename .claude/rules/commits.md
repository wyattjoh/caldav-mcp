---
description: Conventional Commits, commit cadence
paths:
  - "**"
alwaysApply: true
---

All commits use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`. Scope is optional.

Commit cadence: one commit per green task. Keep commits small and self-contained so release-please can parse them correctly.

Do not use em-dashes anywhere (commits, comments, docs, PR descriptions).
