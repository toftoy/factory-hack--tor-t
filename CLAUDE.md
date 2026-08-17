# Repo notes for Claude Code

This repo is a fork of Microsoft's "Intelligent Predictive Maintenance
Hackathon" (see `README.md`), plus unrelated side projects added under their
own top-level folders (e.g. `rubiks-kube-solver/`).

## Skills

`.claude/skills/` contains the [Superpowers](https://github.com/obra/superpowers)
skill library (brainstorming, systematic-debugging, test-driven-development,
writing-plans, requesting/receiving-code-review, verification-before-completion,
and more) — vendored as plain project skills rather than installed as a
plugin. See `.claude/skills/SUPERPOWERS-NOTICE.md` for the full list,
provenance, and license.

**Read `.claude/skills/using-superpowers/SKILL.md` first, at the start of any
work in this repo, before writing code or even asking clarifying questions.**
It explains when each skill applies and that invoking a relevant skill is not
optional. When its examples say `superpowers:brainstorming` etc., use the
plain name instead (`brainstorming`) — see the notice file for why.
