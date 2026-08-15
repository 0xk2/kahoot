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

### R1-3 creator harness

Run `npm run harness`, then open <http://127.0.0.1:4173/creator>. Authentication is bypassed only
for this local surface. The library includes published, draft, and archived mock quizzes. Search,
filter, sort, switch grid/list display, or create a quiz; open one to edit multiple-choice answers,
correct selections, points, and timers, then save it to the in-memory store.

Expected result: saved values remain available until the harness restarts and invalid quizzes show
a contract error. Important edges: every question needs 2–10 answers and at least one correct
answer; single choice accepts exactly one correct answer; timers are 5–300 seconds; points are
0–100,000. The editor prevents removing the final question or reducing an answer set below two.

### R1-4 live-room harness

Run `npm run harness`, then open <http://127.0.0.1:4173/live>. Authentication is bypassed only
for this local test surface. Create a room to see its unique six-character PIN, join URL, QR code,
50-player counter, and host controls. Open the join URL in another browser tab, choose a nickname,
and watch the lobby update. The “Simulate disconnect” action marks the player offline and then
reconnects with the browser-held token while preserving their identity.

Expected result: the host can start, complete, or cancel a valid lifecycle and remove players;
players see lifecycle updates within one second. Important edges: duplicate nicknames (including
case changes), a 51st player, joins after start, invalid reconnect tokens, and reconnects after a
room ends are rejected. The QR image is provided by `api.qrserver.com`, so its preview needs network
access; the adjacent join link always remains available. For tailnet testing, use
`HOST=$(tailscale ip -4) npm run harness` and open <http://sontra.tailc1c4f8.ts.net:4173/live>.

### R1-5 player harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/play>. The direct player surface needs no account. Join the
representative live space quiz with PIN `ORBIT1` and any nickname, answer its single- and
multiple-choice questions, then use “Harness: next question” to advance through feedback to the
final score. “Reset demo” clears players and progress.

Expected result: the layout works at phone and desktop widths, a submitted answer locks and shows
feedback and points, and the final screen shows the accumulated score. Important edges: a wrong
PIN, a blank or case-insensitive duplicate nickname, selecting multiple answers on a single-choice
question, refreshing after joining, and attempting to submit twice.

### R1-6 timed progression harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/play>. Use “Host-paced demo” to give every joined player the
same timed question and let the host-style Advance control move everyone together. Use
“Player-paced demo” to let each player advance independently after answering or timing out.

Expected result: the countdown has a stable server deadline, answers are rejected after it expires,
and a timeout produces zero-point feedback. Player-paced participants cannot advance before
answering or expiry. Refreshing preserves the same deadline. Switching mode or resetting
intentionally clears scores and progress.

Import all public contracts from the package-local entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```
