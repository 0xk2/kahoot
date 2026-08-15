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

Creator accounts use case-insensitive usernames and passwords hashed with salted scrypt. Login
issues a seven-day opaque session token; only its SHA-256 hash is stored. HTTP integrations use
the `kahoot_session` cookie with `HttpOnly` and `SameSite=Strict` (and `Secure` in production).

## Getting started

Node.js 22 or newer is required. There are no third-party dependencies.

```sh
npm test
npm run harness
```

For tailnet access, run `HOST=$(tailscale ip -4) npm run harness` and open
<http://sontra.tailc1c4f8.ts.net:4173>.

Open <http://127.0.0.1:4173> for the issue R1-2 human test harness. It uses an isolated in-memory
database and directly exposes register, login, current-session, and logout actions without any
unrelated application authentication. Use `demo_creator` / `correct horse battery staple`, or
register the prefilled creator. Expect login and registration to establish a session, “Check
session” to return the creator, and logout to revoke it. Try a duplicate mixed-case username, a
password shorter than 12 characters, invalid characters, and a wrong password as edge cases.
The harness is a development surface, not a production server; restarting it resets all data.

Import all public contracts from the package-local entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```
