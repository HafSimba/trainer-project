---
name: refactor-plan
description: "Plan a multi-file refactor with proper sequencing and rollback steps. Use when preparing non-trivial codebase changes across types, implementation, and tests."
argument-hint: "Describe the refactor goal and constraints"
---

# Refactor Plan

Create a detailed, execution-ready plan for a refactoring task before making code changes.

## When to Use

- Multi-file or cross-module refactors
- Changes that can break type contracts, runtime behavior, or tests
- Work that requires sequencing, verification gates, and rollback safety

## Required Input

Provide the refactor goal in clear terms:

```text
Refactor Goal: <what should change and why>
Constraints: <deadlines, compatibility requirements, no-downtime, etc.>
Out of scope: <what must not change>
```

## Procedure

1. Search the codebase to understand current behavior and architecture.
2. Identify all affected files and map dependencies between them.
3. Build a safe change sequence:
   - Types and interfaces first
   - Implementations second
   - Tests third
   - Cleanup and docs last
4. Add verification checkpoints after each step.
5. Define rollback actions for partial failure.
6. Present the plan and ask for execution confirmation:
   - Shall I proceed with Phase 1?

## Decision Points

- If dependencies are unclear, pause and list assumptions explicitly.
- If risk is high, split the refactor into smaller phases with independent verification.
- If behavior changes are unavoidable, call out migration steps and compatibility strategy.
- If test coverage is weak, include test hardening before implementation changes.

## Quality Checks

- Every affected file has change type and dependency mapping.
- Every phase has explicit verification criteria.
- Rollback steps are concrete and executable.
- Risks include mitigations, not only warnings.
- Plan can be executed incrementally without losing a stable baseline.

## Output Format

Use this exact structure:

```markdown
## Refactor Plan: [title]

### Current State

[Brief description of how things work now]

### Target State

[Brief description of how things will work after]

### Affected Files

| File | Change Type          | Dependencies           |
| ---- | -------------------- | ---------------------- |
| path | modify/create/delete | blocks X, blocked by Y |

### Execution Plan

#### Phase 1: Types and Interfaces

- [ ] Step 1.1: [action] in `file.ts`
- [ ] Verify: [how to check it worked]

#### Phase 2: Implementation

- [ ] Step 2.1: [action] in `file.ts`
- [ ] Verify: [how to check]

#### Phase 3: Tests

- [ ] Step 3.1: Update tests in `file.test.ts`
- [ ] Verify: Run `npm test`

#### Phase 4: Cleanup

- [ ] Remove deprecated code
- [ ] Update documentation

### Rollback Plan

If something fails:

1. [Step to undo]
2. [Step to undo]

### Risks

- [Potential issue and mitigation]
```

## Completion Prompt

End every plan with:

```text
Shall I proceed with Phase 1?
```
