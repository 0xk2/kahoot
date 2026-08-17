# R7-1 merged-delivery retention audit

Audit baseline: `origin/main` at `b8972cf` on 2026-08-17. Evidence was generated with
`git show -s --format='%H %P' <merge>`, `git diff-tree -m --first-parent --name-status <merge>`,
`git diff <merge>..origin/main`, and HTTP assertions in `test/accumulated-flow.test.js`.
“Present” below means source survived; it does not imply reachability from a deployable runtime.

## Revision and outcome map

| PR / issue | merge (first parent; topic) | expected delivery | current-main evidence | classification |
|---|---|---|---|---|
| #1 R1-1 | `45151ef` (`77058c7`; `cc1abb8`) | auth/quiz/session/gameplay contracts, SQLite schema, validation route | `src/contracts/**` and `db/schema.sql` remain; harness imports contracts and applies schema | retained in canonical runtime |
| #2 R1-2 | `e9ec4d9` (`45151ef`; `02ecb01`) | scrypt login, cookie sessions, SQLite auth persistence | auth routes persist in harness SQLite; no production entrypoint and creator/host routes ignore the session | retained only as a test artifact |
| #3 R1-3 | `12c923c` (`e9ec4d9`; `de7a84a`) | creator library/editor and saved quizzes | files and routes remain, but `createCreatorStore` is seeded in memory on every harness start | retained only as a test artifact |
| #4 R1-4 | `5616234` (`12c923c`; `5930eb8`) | 50-player rooms, PINs, reconnect, lifecycle | room service and `/live` remain; HTTP service is harness-owned and in memory | retained only as a test artifact |
| #5 R1-5 | `c4e1e6f` (`5616234`; `9b13c65`) | anonymous join through timed questions and score | fixed `ORBIT1` player game remains, but a player from `/api/rooms/join` is unknown to `/api/player/state` | regressed |
| #6 R1-6 | `1c3a5f2` (`c4e1e6f`; `a198b8a`) | host/player pacing and deadlines | game unit and mock-player routes remain; progression is disconnected from launched rooms | retained only as a test artifact |
| #7 R1-7 | `a854fa1` (`1c3a5f2`; `142fe73`) | fixed/speed scoring, reveals, leaderboard | scoring/game tests remain; rivals and advance are explicitly `/harness/` APIs | retained only as a test artifact |
| #8 R1-8 | `4d797b4` (`a854fa1`; `33bdcf8`) | authenticated creator launch into secure hosting | creator-to-room launch remains, but `authenticate` always returns Demo Creator and gameplay is separate | regressed |
| #9 R2-1 | `3376d12` (`4d797b4`; `6f58ba6`) | responsive creator/host/player UI | CSS and `/mobile` review hub remain; all backed by mock surfaces | retained only as a test artifact |
| #10 R3-1 | `6ac5ab9` (`3376d12`; `61a772e`) | public landing with host and PIN entry | `/` serves landing and links creator/player; entered PIN reaches only fixed mock gameplay | retained only as a test artifact |
| #11 R4-1 | `c222116` (`6ac5ab9`; `f67df13`) | Quizzes name and distinct page titles | title helper and title tests remain on all served pages | retained in canonical runtime |
| #12 R5-1 | `45736b3` (`c222116`; `fbb8720`) | concurrent isolated live sessions | room isolation remains in memory and `/concurrent` is explicitly a harness | retained only as a test artifact |
| #13 R6-1 | `90fc619` (`45736b3`; `d47eace`) | functionality/architecture guide and docs surface | guide and `/docs` remain, but its deployable-product claims exceed the harness runtime | retained only as a test artifact |
| #14 R5-2 | `b8972cf` (`90fc619`; `e53397d`) | host session hub, controls, question results | `/host`, host display, deterministic seeded sessions and mock result injection remain | retained only as a test artifact |

No issue is classified “unverifiable”: all 14 merge objects, both parents, trees, current files,
and reachable HTTP behavior are available locally. R1-1 and R4-1 are runtime-retained only for their
bounded contract/schema and naming claims; this is not a claim that a production server exists.

## Supersession and reachability evidence

- No path added by PRs 1–14 is deleted from the current tree. `public/harness.html` is still present
  but was superseded as `/` by `public/landing.html` at topic revision `61a772e` (PR #10).
- Host hub files first existed on side revision `5944cc8`, were absent from the PR #11 merge tree
  `c222116`, and last returned through topic merge `b8972cf` (PR #14).
- `src/harness/server.js` is the only process entrypoint (`npm run harness`). It labels itself a
  harness, seeds representative data, uses `:memory:` SQLite, bypasses room authentication with a
  fixed identity, and exposes mock-only advance/rival/result routes.
- Durable tables survive in `db/schema.sql`, but only auth repositories use SQLite. Creator quizzes,
  rooms, participants, gameplay, responses, and scores use separate in-memory stores.
- The normal landing path splits: creator launch uses `RoomService`, while `/play` uses a distinct
  `createPlayerGame` seeded with `ORBIT1`. Thus source presence does not provide one accumulated flow.

## Accumulated regression specification and reconciliation scope

Run `node --test test/accumulated-flow.test.js`. Passing assertions retain the landing, creator,
host, player surfaces and room creation/join. Three named TODO failures reproduce the confirmed gaps.

Exact reconciliation scope is: add a non-harness server entrypoint; authorize creator and host APIs
from `kahoot_session`; replace creator, room, participant, progression, response, and score memory
stores with schema-backed repositories; make `/play?pin=<launched PIN>` use the same room/session state
as host controls; remove mock rival/result/advance behavior from deployable routes; and add restart
and authenticated end-to-end tests. Visual polish, new question types, deployment, and infrastructure
changes are outside R7-1.

## Human review surface

Run `HOST=$(tailscale ip -4) npm run harness` and open
`http://sontra.tailc1c4f8.ts.net:4173/audit`. Follow creator → host → player with the representative
Space quiz. Expected: every retained surface opens and the page explicitly lists the three gaps.
Edges: invalid creator cookies still access creator data, a launched-room participant cannot load
gameplay state, and restarting restores mock data rather than saved changes.
