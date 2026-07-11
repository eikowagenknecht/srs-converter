Create git commits for the current changes. Works on main (config/docs work) and on worktree branches (intermediate saves — the full checks run in `/done`).

## Scope

Based on `$ARGUMENTS`:

- **Empty (default):** Only commit changes that are part of the current task. Exclude files that look unrelated to the work done in this conversation.
- **`all`:** Commit everything — all staged, unstaged, and untracked files.
- **`yolo`:** Same as default scope, but skip the approval step — present the plan and immediately execute the commits without waiting for confirmation.

## Preflight context

When invoked as a slash command, a UserPromptSubmit hook injects a `PREFLIGHT (/commit)` block with `git status --short`, per-file `git diff HEAD --numstat`, and recent commit subjects. **Use that block — do not re-run those commands.** If no preflight block is present (e.g. invoked inline from another flow), run `git status --short` and `git diff HEAD --numstat` once.

## Steps

1. **Group files into commits from the preflight data and what you already know.** You made most of these changes in this session — group and draft messages from the status, the numstat, and memory. Read a full diff **only** for files you didn't author or don't remember; don't re-read your own edits. For default scope, exclude dirty files unrelated to this task (including other agents' work on different tasks); include other agents' changes on the same task. If changes span logically distinct units, split into multiple commits in dependency order; each commit should be self-contained.

2. **Present the plan and wait for approval.** One line per commit, nothing else — no table, no +/- totals, no notes, no methodology recap:

   ```
   1. feat(srs): add media dedup on import (3 files)
   2. test(srs): media dedup coverage (1 file)

   Excluded: `src/unrelated.ts` (not part of this task)

   **COMMIT?**
   ```

   - Omit the "Excluded" line if nothing is excluded.
   - If a file rides in a different commit than its theme suggests, that's fine silently — mention it only if the user would otherwise be misled.
   - Do not proceed until the user confirms (unless `yolo` mode — then skip straight to step 3).

3. **Execute the commits.** Follow the repo's atomic-commit convention (CLAUDE.md): list each path explicitly — `git commit -m "<message>" -- path/to/file1 path/to/file2`; for brand-new files, `git restore --staged :/ && git add "path/to/new" && git commit -m "<message>" -- path/to/new`. Quote paths containing brackets or parentheses. Never use `--no-verify`, and never `--no-gpg-sign` — if GPG signing fails, stop and wait for the user. Always commit whole files — never `git add -p`. When possible, chain the commits into one Bash call.

4. Run `git status --short` to confirm the result (chain it onto the last commit command).

## Scopes and release impact

Add a Conventional Commit scope when the change clearly belongs to one area (match the ones already used in `git log`):

- `anki` — Anki format support (`src/anki/`)
- `srs` — the universal SRS format / core conversion logic
- `deps` / `deps-dev` — dependency updates
- `claude` — `.claude/` tooling and `CLAUDE.md`
- `ci` — GitHub Actions / CI config
- docs commits scope by docs area: `docs(spec)`, `docs(formats)`, `docs(decisions)`, `docs(working)`, `docs(anki)`

Omit the scope when the change genuinely spans multiple areas or none of these fit. Commitlint enforces the conventional format with max 100 chars per line.

**semantic-release owns releases and `CHANGELOG.md`:** `feat:` / `fix:` commits on main trigger releases, and their subjects become changelog entries — write them user-readable. Never edit `CHANGELOG.md` manually.
