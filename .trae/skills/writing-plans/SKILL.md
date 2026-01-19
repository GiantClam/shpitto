---
name: writing-plans
description: Use after a design is approved (Brainstorming phase complete). Breaks the design into a step-by-step implementation plan.
---

# Writing Plans

## Overview

A plan bridges the gap between "Design" and "Code".

It breaks the work into small, verifiable tasks that can be executed sequentially.

**Violating the letter of this process is violating the spirit of engineering.**

## When to Use

**Always:**
- After `brainstorming` is complete
- Before writing any implementation code
- When a task is too big to do in one step

## The Plan Structure

A plan is a Markdown file (e.g., `plan.md`) containing a list of tasks.

### Task Format

Each task MUST include:
1. **Description**: What to do.
2. **Files**: Which files to create or modify.
3. **Step-by-Step**: Detailed instructions.
4. **Verification**: How to prove it works (Test command, manual check).

### Example Plan

```markdown
# Implementation Plan - Blog Feature

## Phase 1: Setup & Data Model

- [ ] **Task 1: Create Post Model**
  - **Files**: `src/models/Post.ts`
  - **Steps**:
    1. Define `Post` interface (title, content, date).
    2. Create Zod schema for validation.
  - **Verification**: `npm test src/models/Post.test.ts` (Create test first!)

- [ ] **Task 2: Database Migration**
  - **Files**: `prisma/schema.prisma`
  - **Steps**:
    1. Add `Post` model to Prisma schema.
    2. Run migration.
  - **Verification**: `npx prisma studio` to see table.

## Phase 2: API

- [ ] **Task 3: Create Post API**
  - **Files**: `src/pages/api/posts.ts`
  - **Steps**:
    1. Implement GET (list).
    2. Implement POST (create).
  - **Verification**: `curl` commands to test endpoints.

## Phase 3: UI

- [ ] **Task 4: Post List Component**
  - **Files**: `src/components/PostList.tsx`
  - **Steps**:
    1. Fetch data from API.
    2. Render list of posts.
  - **Verification**: Check browser, verify posts appear.
```

## Rules for Good Plans

1. **Small Steps**: Each task should take < 10 minutes for an AI to execute.
2. **Test-First**: Verification steps should often involve running a test.
3. **Sequential**: Task B should not depend on Task C.
4. **Complete**: Don't leave "magic" steps. Be explicit.

## Transition

After the plan is written and saved to `plan.md`:
- **NEXT STEP:** Invoke `superpowers:execute-plans` (or manually execute tasks one by one using `test-driven-development`).
