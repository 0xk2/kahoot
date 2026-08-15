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

Import all public contracts from the package-local entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```
