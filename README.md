# Quizzes

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

### R4-1 naming and page-title harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/>. This direct public surface needs no account and uses the
representative `ORBIT1` room and mock quiz library already provided by the isolated harness. Follow
the creator, host, and player paths and confirm that the shared brand reads **Quizzes** while each
browser tab identifies its current page or view.

Expected result: the home, quiz library, creator editor, host/join lobby, player question, feedback,
and final leaderboard views have distinct titles ending in `| Quizzes`. Important edges: returning
from the editor restores the library title, opening different quizzes includes the selected quiz
name, and host/player lobby titles include the room PIN. Restarting the harness resets all data.

### R3-1 public landing-page harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/>. This direct public surface requires no account. Use
**Create & host a quiz** to enter the representative creator library, or submit PIN `ORBIT1` to
arrive at the player join screen with the room code prefilled.

Expected result: both entry paths are prominent and keyboard accessible, invalid or incomplete
PINs stay on the page with a useful error, and the layout remains usable at phone and desktop
widths. Important edges: lowercase PINs normalize to uppercase, punctuation is removed, PINs must
contain 4–12 letters or numbers, and the player still chooses a nickname before joining.

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

### R1-7 scoring and leaderboard harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/play>. Authentication is bypassed only on this local player
surface. Choose fixed or speed-weighted scoring before joining PIN `ORBIT1`. Answer a question,
then select “Add mock rival answers” to populate the live leaderboard with fast, slow, and wrong
representative answers. Advance through both questions to see the final leaderboard.

Expected result: fixed scoring awards all configured points for any correct answer; speed-weighted
scoring awards 50–100% according to elapsed time. Feedback identifies every correct option, marks
an incorrect selected option, shows the explanation, and ranks tied scores equally. Important
edges: wrong and partially correct answers earn zero, late answers receive the 50% floor, duplicate
submissions remain rejected, tied players share a rank, and the final ranking remains available.

### R1-6 timed progression harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/play>. Use “Host-paced demo” to give every joined player the
same timed question and let the host-style Advance control move everyone together. Use
“Player-paced demo” to let each player advance independently after answering or timing out.

Expected result: the countdown has a stable server deadline, answers are rejected after it expires,
and a timeout produces zero-point feedback. Player-paced participants cannot advance before
answering or expiry. Refreshing preserves the same deadline. Switching mode or resetting
intentionally clears scores and progress.

### R1-8 integrated creator-to-host harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/creator>. Authentication is bypassed only by this local
harness, which supplies the representative `Demo Creator` identity to the normal room authorization
boundary. Select **Host live** on the published “A Tiny Tour of Space” quiz to open its host display,
then join from the displayed link in another tab and start, complete, or cancel the room.

Expected result: only a published quiz can launch, the host display keeps its PIN and player list
current, and lifecycle/player-removal actions are accepted only for the owning creator at the latest
room revision. Important edges: drafts and archived quizzes cannot launch; a stale simultaneous host
action is rejected and refreshed rather than applied twice; public room responses do not expose the
creator identifier; joins remain anonymous and do not grant host controls. Restarting the harness
resets its isolated in-memory data.

Import all public contracts from the package-local entry point:

```js
import { parseQuiz, parseSubmitAnswerInput } from './src/contracts/index.js';
```

### R2-1 mobile layout harness

Run `HOST=$(tailscale ip -4) npm run harness`, then open
<http://sontra.tailc1c4f8.ts.net:4173/mobile>. This direct review hub bypasses unrelated
authentication and links to the interactive creator, host, and player surfaces with representative
mock quizzes and gameplay. Test at 320–430 px wide in both portrait and landscape.

Expected result: pages do not scroll horizontally; controls remain reachable and comfortably
tappable; long titles, answers, nicknames, and room details stay contained; and bottom controls
respect device safe areas. Important edges: open the creator question editor, create a host room and
add several players, complete both single- and multiple-choice player questions, rotate a
short-height phone, and enable large browser text.
