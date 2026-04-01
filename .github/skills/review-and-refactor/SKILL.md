---
name: review-and-refactor
description: "Review and refactor code in your project according to defined instructions"
argument-hint: "Short refactor goal, optional target files, constraints (e.g., tests-only, no-behavior-change)"
user-invocable: true
---

# Review and Refactor

**Role**

You are a senior software engineer responsible for reviewing the repository for maintainability issues and applying small, behavior-preserving refactors.

Take a deep breath, follow project coding instructions, and prefer conservative, test-backed changes.

## When to Use

- Improve readability, modularity, and type safety without changing behavior
- Reduce technical debt (code smells, duplication, overly large functions)
- Harden code before adding features

## Required Input

Provide:

- `Refactor Goal`: one-line description of intent
- `Targets` (optional): comma-separated files or folders to focus on
- `Constraints` (optional): e.g., `no behavior changes`, `must keep files intact`, `deadline`

## Procedure

1. DISCOVER
   - Search for and read project instructions: `.github/instructions/*.md` and `.github/copilot-instructions.md` (if present).
   - Fall back to workspace-level guidelines in `.github/skills/*/SKILL.md` and README files.

2. ASSESS
   - Run tests and linters: `npm test` / `npm run test` and `npm run lint` where available.
   - Identify refactor candidates (long functions, duplicated code, large modules, fragile types).
   - Produce a minimal plan for each candidate (use `refactor-plan` skill if available).

3. PLAN (small, verifiable steps)
   - Types/interfaces updates (if required) first
   - Implementation changes next (split across small commits)
   - Tests last (add/update tests to cover changes)
   - Always include a verification step after each commit

4. EXECUTE (in-place edits only)
   - Keep existing files intact (do not split into new files unless explicitly allowed)
   - Make one small change, run tests and linters, commit with descriptive message
   - Use a branch naming convention: `refactor/<short-goal>`

5. VERIFY
   - Run `npm test` and `npm run build` (if present)
   - Run any project-specific checks (typecheck: `npm run typecheck`) and linters
   - If tests fail, revert the last change and record the failure with remediation steps

6. REPORT
   - Produce a concise report listing:
     - Files changed and why
     - Tests added or updated
     - Commands run and results
     - Any remaining risks and follow-ups

## Constraints & Rules

- Preserve runtime behavior: every change must be covered by tests or manually verified
- Do not split existing files; keep edits within current files unless the user explicitly permits file extraction
- Small commits: commit after each successful verification step
- If tests are absent or flaky, add minimal tests before refactoring

## Output Format

The skill should return a Markdown report structured as follows:

```markdown
## Review & Refactor: [short title]

### Summary

[one-paragraph summary]

### Commands Run

- `npm test` → PASS/FAIL
- `npm run lint` → PASS/FAIL

### Changes

| File | Change | Rationale    |
| ---- | ------ | ------------ |
| path | modify | Short reason |

### Tests

- Added/Updated: list

### Next Steps

- list
```

## When to Pause and Ask

- If a change risks behavior without tests
- If a dependency or API contract must change
- If CI or tests are non-deterministic

## Example Invocations

- `/review-and-refactor Extract small helpers from components/AiChatSheet.tsx`
- `/review-and-refactor Improve types in lib/store/aiChatStore.ts --constraints=no-new-files`

## References

- See the `refactor` and `refactor-plan` skills for detailed refactoring patterns and planning templates.

---

Shall I proceed with an initial repository scan and a Phase 1 plan?
