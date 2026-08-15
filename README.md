# kahoot

A multiplayer quiz project managed through ShipLoop.

## Project information

- GitHub repository: [0xk2/kahoot](https://github.com/0xk2/kahoot)
- Delivery workflow: feature branch → main → production
- Coding work: isolated issue worktrees with a production guard

## Contracts and data model

The dependency-free ES module contracts in `src/contracts/` are the shared boundary for auth,
quiz authoring, game sessions, and live gameplay. Each exported `parse…` function validates
untrusted input, returns a normalized frozen value, and throws `ContractError` with the failing
field path. Timestamps use ISO-8601 UTC strings and identifiers are opaque strings.

The portable SQLite schema is in `db/schema.sql`. It uses standard SQLite tables, constraints,
foreign keys, and indexes without relying on a particular JavaScript database driver. Consumers
must enable foreign keys on every connection; the schema does so when it is applied.

## Getting started

Node.js 22 or newer is required. There are no third-party dependencies.

```sh
npm test
npm run harness
```

Open <http://127.0.0.1:4173> for the human test harness. It uses representative in-memory mock
data and intentionally bypasses authentication. The page exposes the player-safe live question
shape and lets a developer submit payloads directly to the answer contract. It is a development
surface, not a production server.

### R1-3 creator harness

Run `npm run harness`, then open <http://127.0.0.1:4173/creator>. Authentication is bypassed only
for this local surface. The library includes published, draft, and archived mock quizzes. Search,
filter, sort, switch grid/list display, or create a quiz; open one to edit multiple-choice answers,
correct selections, points, and timers, then save it to the in-memory store.

Expected result: saved values remain available until the harness restarts and invalid quizzes show
a contract error. Important edges: every question needs 2–10 answers and at least one correct
answer; single choice accepts exactly one correct answer; timers are 5–300 seconds; points are
0–100,000. The editor prevents removing the final question or reducing an answer set below two.

Import all public contracts from the package-local entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```
