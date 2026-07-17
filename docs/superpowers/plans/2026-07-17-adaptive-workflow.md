# Adaptive Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的自适应工作流程写成项目级指令，使以后处理本项目任务时自动应用风险分级、范围保护、专项检查和完成标准。

**Architecture:** 在仓库根目录新增一个 `AGENTS.md` 作为项目级工作约定。它只规定决策与验证流程，不改变网站运行代码；可选的自动化检查仍保留为未来按需升级项。

**Tech Stack:** Markdown、Git、现有 Python 单元测试、现有 Node.js 静态构建脚本

---

## File Structure

- Create: `AGENTS.md` - 为本项目中的后续任务提供项目级执行规则。
- Reference: `docs/superpowers/specs/2026-07-17-adaptive-workflow-design.md` - 已批准的完整设计和决策依据。
- No runtime files change: 本计划不修改 HTML、CSS、JSON、Python 服务或构建逻辑。

### Task 1: Install the Project-Level Workflow

**Files:**
- Create: `AGENTS.md`
- Test: project-level shell checks and existing project verification commands

- [ ] **Step 1: Verify the project instruction file does not already exist**

Run:

```powershell
Test-Path .\AGENTS.md
```

Expected: `False`. If the result is `True`, read the existing file and merge these rules without deleting user instructions.

- [ ] **Step 2: Create the project instruction file**

Create `AGENTS.md` with exactly this content:

```markdown
# Project Working Agreement

## Task Intent

- For answers, explanations, reviews, and status reports, inspect and report without changing files or external state unless the request also asks for a change.
- For diagnosis, find and explain the root cause. Implement a fix only when the request includes fixing it.
- For change or build requests, implement the requested result, verify it in proportion to risk, and report the outcome.
- For monitoring or waiting requests, keep observing the requested state; no change is not itself a failure.

## Risk Level

- Low risk: explanations, content edits, small style changes, and clear single-point changes. Inspect, execute, run a focused check, and report.
- Medium risk: features, multi-file changes, interaction changes, build configuration, and fixes that may affect adjacent behavior. Present a short approach, execute, run tests and builds, and report.
- High risk: destructive data operations, authentication or security, dependency upgrades, production deployment, broad refactors, and actions that are hard to reverse. Explain impact and rollback, obtain confirmation, execute in steps, and run regression checks.
- Treat a task as high risk when any of these dimensions is high: blast radius, reversibility, data or security impact, or production impact.
- An action explicitly requested by the user is authorized. Get separate approval before materially expanding scope or adding a destructive, external, or hard-to-reverse action.

## Execution

1. Confirm the goal, constraints, expected result, and completion criteria.
2. Read the relevant files, project documentation, recent changes, and worktree state.
3. Use only the skills, tools, and existing project capabilities that directly help the task.
4. Trace the real execution path and fix the shared root cause when applicable.
5. Reuse existing patterns and make the smallest correct change.
6. Preserve user changes. Do not revert, overwrite, or clean unrelated work.
7. Run fresh verification that matches the risk and the behavior changed.
8. Review the final diff for unrelated files, sensitive information, and regressions.
9. Report the result, key files, verification evidence, and remaining limitations.

## Project Checks

- Content and data: check consistency among `content.json`, archive data, works, and media. Preserve original data before irreversible changes.
- Local editor service: when relevant, verify editing, publishing, deletion, comments, uploads, authentication boundaries, input validation, and path restrictions.
- Pages and interactions: check desktop and mobile layouts, text overflow, interaction states, and asset loading. Use browser inspection for visual changes.
- Static publishing: run `node build-static.mjs` and verify the expected pages and assets exist in `dist`.
- Deployment: inspect `vercel.json`, required environment variables, sensitive-file exclusions, target environment, and rollback. Production deployment is high risk.

## Completion

- Do not claim completion from code changes alone; use fresh verification evidence.
- Run the closest focused check for low-risk changes.
- Run relevant tests and the static build for medium-risk changes; add desktop and mobile checks for UI work.
- Add regression, data-protection, and rollback checks for high-risk changes.
- If verification cannot run, state exactly what was not checked, why, and the remaining risk.
- Keep simple handoffs concise. For larger work, report what changed, key files, verification results, and open limitations.
```

- [ ] **Step 3: Verify the required policy sections are present**

Run:

```powershell
$required = 'Task Intent','Risk Level','Execution','Project Checks','Completion'
$content = Get-Content -Raw .\AGENTS.md
$missing = $required | Where-Object { $content -notmatch "## $_" }
if ($missing) { throw "Missing sections: $($missing -join ', ')" }
Write-Output 'AGENTS.md sections verified'
```

Expected: `AGENTS.md sections verified` and exit code `0`.

- [ ] **Step 4: Verify the instruction file contains no unfinished placeholders**

Run:

```powershell
$incompleteTokens = @(
    ([string]::Concat('T','B','D')),
    ([string]::Concat('T','O','D','O'))
)
$matches = Select-String -Path .\AGENTS.md -Pattern ($incompleteTokens -join '|')
if ($matches) { $matches; throw 'Unfinished placeholders found' }
Write-Output 'No placeholders found'
```

Expected: `No placeholders found` and exit code `0`.

- [ ] **Step 5: Run the existing project checks**

Run:

```powershell
python -m unittest -v
node build-static.mjs
```

Expected: the Python test suite reports no failures, the static build exits with code `0`, and `dist` is generated. Because only project instructions changed, any runtime failure is not fixed within this task unless it was caused by the new file.

- [ ] **Step 6: Review the final change boundary**

Run:

```powershell
git status --short
git diff --check
git diff -- AGENTS.md
```

Expected: `AGENTS.md` is the only newly modified implementation file, `git diff --check` reports no errors, and the diff matches the approved workflow. Existing unrelated user changes, if any, remain untouched and are not staged.

- [ ] **Step 7: Commit the project workflow**

Run:

```powershell
git add -- AGENTS.md
git commit -m "Add project workflow instructions"
```

Expected: one commit containing only `AGENTS.md`.

## Deferred Improvements

Do not implement these in this plan:

- JSON structure validation for content files.
- Static-output integrity automation.
- Desktop and mobile visual baselines.
- Deployment checklist generation.

Add one of these only after a repeated failure demonstrates that its maintenance cost is justified.
