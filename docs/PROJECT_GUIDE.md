# Quizzes project guide

Quizzes is a dependency-free multiplayer quiz application. A creator authors a quiz, launches one
or more isolated live rooms, and controls each room lifecycle. Players join anonymously with a room
PIN and nickname, answer timed questions, receive feedback, and see a ranked leaderboard.

## Functionality

### Creator workflow

- Register and sign in with a creator account backed by revocable, seven-day sessions.
- Browse, search, filter, and sort a library of draft, published, and archived quizzes.
- Create and edit quizzes with single- or multiple-choice questions, 2–10 options, one or more
  correct answers, 5–300 second timers, explanations, and configurable points.
- Launch published quizzes into independent rooms. Draft and archived quizzes cannot be hosted.

### Host workflow

- Create multiple concurrent rooms from the same quiz; each receives its own six-character PIN,
  join URL, participant list, lifecycle, and revision.
- Monitor up to 50 players, remove a player, and start, complete, or cancel the room.
- Use revision checks to reject stale host actions instead of applying a transition twice.

### Player workflow

- Join without a creator account using a PIN and a room-unique, case-insensitive nickname.
- Reconnect with a browser-held token while a room is live.
- Answer single- and multiple-choice questions before their shared server deadline. Correct answers
  remain hidden until feedback.
- Play in host-paced or player-paced mode, earn fixed or speed-weighted points, and view feedback
  plus live and final leaderboards. Wrong, partial, late, and duplicate submissions earn no points
  or are rejected as appropriate.

## Technology and architecture

The runtime is Node.js 22 or newer using ECMAScript modules. It uses only built-in Node APIs:
`node:http` for the harness server, `node:sqlite` for SQLite access, `node:crypto` for password and
session security, and `node:test` for tests. There are no third-party runtime or development
dependencies, frontend framework, bundler, transpiler, or generated application assets.

Browser surfaces are semantic HTML, CSS, and JavaScript in `public/`. Server modules live in
`src/`: `auth/` handles creator identity, `contracts/` validates boundaries, `creator/` manages the
quiz library, `rooms/` owns live-room state, and `player/` owns gameplay and scoring. The development
harness in `src/harness/` composes these modules with representative data. The portable schema in
`db/schema.sql` defines durable creator, quiz, session, room, participant, and response records.

Contract parsers normalize and freeze untrusted input and report the failing field through
`ContractError`. Import the shared boundary from its package entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```

## Build and run workflow

Clone into an isolated issue worktree and use Node.js 22+. No install or compilation step is needed
because the repository has no external packages and serves native source files directly.

```sh
node --version
npm run check
npm run harness
```

The harness defaults to `http://127.0.0.1:4173`. For review on this machine's tailnet, bind only to
its Tailscale address:

```sh
HOST=$(tailscale ip -4) npm run harness
```

Open `http://sontra.tailc1c4f8.ts.net:4173/docs`. The harness bypasses creator authentication only
on its explicit local review surfaces and stores all data in memory; restarting resets the demo.

## Test and acceptance workflow

`npm test` runs deterministic tests through Node's test runner. The suite covers contracts, schema,
authentication and cookies, creator storage, room authorization and concurrency, gameplay timing,
scoring, page titles, and the HTTP harness. `npm run check` is the repository production guard and
currently delegates to that full suite.

Before acceptance:

1. Run `npm test` while developing and add a focused test for every behavior change.
2. Start the R6-1 harness and compare `/docs` with this guide.
3. Follow the creator, host, and player links using the “A Tiny Tour of Space” mock quiz.
4. Commit all issue changes, confirm the worktree is clean, then run `npm run check`.
5. Record the command, review URL, expected outcome, and meaningful edge cases in the handoff.

Do not merge, deploy, or change production infrastructure from an issue worktree. Promotion remains
feature branch → main → production, and a failing guard blocks acceptance.
