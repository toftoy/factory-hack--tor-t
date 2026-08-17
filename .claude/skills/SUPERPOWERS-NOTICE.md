# Superpowers skills — provenance

The skill folders in this directory (`brainstorming`, `systematic-debugging`,
`test-driven-development`, etc.) are vendored from
[obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent,
commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, MIT licensed. Full license
text below, per the MIT requirement to retain it in copies of the software.

They were copied in directly (not installed via `/plugin install`) because
this repository is worked on from Claude Code on the web, which cannot run
the interactive `/plugin marketplace add` / `/plugin install` commands. That
has one practical consequence: the upstream skill files cross-reference each
other with a `superpowers:` namespace prefix (e.g. `superpowers:brainstorming`),
which is how they'd be addressed *if* installed as a real plugin. Vendored
here as plain project skills, they're invoked by their bare names instead —
`brainstorming`, `systematic-debugging`, `writing-plans`, and so on. Treat any
`superpowers:xxx` reference you encounter inside these files as meaning the
plain skill `xxx`.

To pick up upstream fixes, re-clone `obra/superpowers` and re-copy the
`skills/` directory over this one (or diff it), then commit.

## Available skills

- **brainstorming** — use before any creative work (new features, components, behavior changes): explores intent, requirements, and design before implementation.
- **dispatching-parallel-agents** — use for 2+ independent tasks with no shared state or sequential dependency.
- **executing-plans** — use when running a written implementation plan in a separate session with review checkpoints.
- **finishing-a-development-branch** — use once implementation is complete and tests pass, to decide how to integrate the work.
- **receiving-code-review** — use when acting on review feedback; requires verification, not reflexive agreement.
- **requesting-code-review** — use when finishing a task or feature, before merging, to verify it meets requirements.
- **subagent-driven-development** — use when executing a plan's independent tasks within the current session.
- **systematic-debugging** — use for any bug, test failure, or unexpected behavior, before proposing a fix.
- **test-driven-development** — use when implementing a feature or bugfix, before writing implementation code.
- **using-git-worktrees** — use when feature work needs isolation from the current workspace.
- **using-superpowers** — the bootstrap: read this first, it explains when/how to invoke the others.
- **verification-before-completion** — use before claiming work is complete/fixed/passing: run and show verification, not assertions.
- **writing-plans** — use once there's a spec or requirements for a multi-step task, before touching code.
- **writing-skills** — use when creating or editing a skill.

---

## License (MIT, upstream)

MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
