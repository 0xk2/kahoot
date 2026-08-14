# AGENTS.md

This file defines the working agreement for humans and coding agents in kahoot.
Edit it as the project evolves; instructions closest to the code take precedence.

## Project setup

- Inspect the repository, this file, README files, and package scripts before changing code.
- Use JavaScript for server code unless this project explicitly records another choice here.
- Keep runtime data and credentials outside the repository and never commit secrets.

## Code quality

- Keep each handwritten code file below 250 lines by extracting focused modules.
- Follow the repository's formatter and lint rules.
- Add focused automated tests for changed behavior and keep fixtures deterministic.
- Preserve unrelated user changes and avoid destructive Git commands.

## Worktrees and human testing

- Create one feature branch and one isolated worktree for each issue.
- Build a feature-specific human test surface with representative mock data.
- Bypass unrelated authentication only inside the explicit local test harness.
- Document the test command, URL, expected result, and important edge cases.

## Production guard

- Commit all issue changes before running the guard; the worktree must be clean.
- ShipLoop runs the first available package script in this order: guard, check, test.
- The selected script must cover the checks required for this repository.
- A failed guard blocks acceptance and any merge to main.

## Deployment flow

- Promote code through: feature branch → main → production.
- Merge a feature only after its production guard passes.
- Treat main as staging and promote only its verified revision to production.
- Each production deployment must create a revision-bounded LLM changelog.
- Do not merge, deploy, or change production infrastructure from an issue worktree.
