import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { harnessState, quiz, session } from './mock-data.js';
import { ContractError, parseSubmitAnswerInput } from '../contracts/index.js';
import { createPlayerGame, PlayerGameError } from '../player/game.js';
import { creatorQuizzes } from './creator-data.js';
import { createCreatorStore } from '../creator/store.js';
import { applySchema } from '../db/schema.js';
import { AuthRepository } from '../auth/repository.js';
import { AuthService } from '../auth/service.js';
import { createAuthHandler } from '../auth/http.js';
import { RoomService } from '../rooms/service.js';
import { createRoomHandler } from '../rooms/http.js';

const pageUrl = new URL('../../public/harness.html', import.meta.url);
const creatorPageUrl = new URL('../../public/creator.html', import.meta.url);
const creatorScriptUrl = new URL('../../public/creator.js', import.meta.url);
const creatorStyleUrl = new URL('../../public/creator.css', import.meta.url);
const playerPageUrl = new URL('../../public/player.html', import.meta.url);
const playerScriptUrl = new URL('../../public/player.js', import.meta.url);
const playerStyleUrl = new URL('../../public/player.css', import.meta.url);
const liveAssets = new Map([
  ['/live', ['../../public/live.html', 'text/html; charset=utf-8']],
  ['/live.js', ['../../public/live.js', 'text/javascript; charset=utf-8']],
  ['/live.css', ['../../public/live.css', 'text/css; charset=utf-8']],
  ['/mobile', ['../../public/mobile.html', 'text/html; charset=utf-8']],
  ['/mobile.css', ['../../public/mobile.css', 'text/css; charset=utf-8']]
]);

export async function createHarnessServer({ clock } = {}) {
  const store = createCreatorStore(creatorQuizzes, clock);
  const gameOptions = { quiz, session, ...(clock ? { clock } : {}) };
  let scoringMode = 'speed_weighted';
  let progressionMode = 'host';
  let game = createPlayerGame({ ...gameOptions, scoringMode, mode: progressionMode });
  let rivals = [];
  const database = new DatabaseSync(':memory:');
  await applySchema(database);
  const service = new AuthService(new AuthRepository(database));
  await service.register({ username: 'demo_creator', password: 'correct horse battery staple', displayName: 'Demo Creator' });
  const handleAuth = createAuthHandler(service);
  const handleRoom = createRoomHandler(new RoomService({ clock: clock ? () => new Date(clock()) : undefined }), {
    authenticate: () => ({ id: 'user-host', displayName: 'Demo Creator' }),
    findQuiz: (id) => store.get(id)
  });
  return createServer(async (request, response) => {
    try {
      if (await handleAuth(request, response)) return;
      if (await handleRoom(request, response)) return;
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && liveAssets.has(pathname)) {
        const [path, contentType] = liveAssets.get(pathname);
        return send(response, 200, await readFile(new URL(path, import.meta.url), 'utf8'), contentType);
      }
      if (request.method === 'GET' && request.url === '/') {
        return send(response, 200, await readFile(pageUrl, 'utf8'), 'text/html; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/api/state') {
        return json(response, 200, harnessState());
      }
      if (request.method === 'GET' && request.url === '/play') {
        return send(response, 200, await readFile(playerPageUrl, 'utf8'), 'text/html; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/player.js') {
        return send(response, 200, await readFile(playerScriptUrl, 'utf8'), 'text/javascript; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/player.css') {
        return send(response, 200, await readFile(playerStyleUrl, 'utf8'), 'text/css; charset=utf-8');
      }
      if (request.method === 'POST' && request.url === '/api/player/join') {
        return json(response, 201, game.join(await readJson(request)));
      }
      if (request.method === 'GET' && request.url.startsWith('/api/player/state?')) {
        const url = new URL(request.url, 'http://localhost');
        return json(response, 200, game.state(url.searchParams.get('participantId')));
      }
      if (request.method === 'POST' && request.url === '/api/player/answer') {
        return json(response, 200, game.answer(await readJson(request)));
      }
      if (request.method === 'POST' && request.url === '/api/player/harness/advance') {
        const input = await readJson(request);
        return json(response, 200, game.advance(input.participantId));
      }
      if (request.method === 'POST' && request.url === '/api/player/harness/mode') {
        const nextMode = (await readJson(request)).mode;
        const result = game.setMode(nextMode);
        progressionMode = nextMode;
        return json(response, 200, result);
      }
      if (request.method === 'POST' && request.url === '/api/player/harness/rivals') {
        const active = rivals.map((rival) => ({ rival, state: game.state(rival.participantId) }))
          .filter(({ state }) => state.phase === 'question');
        if (!rivals.length) {
          rivals = ['Quasar', 'Pulsar', 'Comet'].map((nickname) =>
            game.join({ joinCode: session.joinCode, nickname, reconnectToken: null }));
          active.push(...rivals.map((rival) => ({ rival, state: game.state(rival.participantId) })));
        }
        const responseTimes = [1000, 9000, 19000];
        active.forEach(({ rival, state }, index) => {
          const question = quiz.questions.find(({ id }) => id === state.question.questionId);
          const correct = question.options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id);
          game.answer({ sessionId: session.id, participantId: rival.participantId,
            questionId: question.id, optionIds: index === 2 ? [question.options.find(({ isCorrect }) => !isCorrect).id] : correct,
            responseTimeMs: Math.min(responseTimes[index], question.timeLimitSeconds * 1000) });
        });
        return json(response, 200, { leaderboard: game.leaderboard() });
      }
      if (request.method === 'POST' && request.url === '/api/player/harness/reset') {
        const input = await readJson(request);
        scoringMode = input.scoringMode || scoringMode;
        game = createPlayerGame({ ...gameOptions, scoringMode, mode: progressionMode });
        rivals = [];
        return json(response, 200, { reset: true, scoringMode });
      }
      if (request.method === 'GET' && request.url === '/creator') {
        return send(response, 200, await readFile(creatorPageUrl, 'utf8'), 'text/html; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/creator.js') {
        return send(response, 200, await readFile(creatorScriptUrl, 'utf8'), 'text/javascript; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/creator.css') {
        return send(response, 200, await readFile(creatorStyleUrl, 'utf8'), 'text/css; charset=utf-8');
      }
      if (request.method === 'GET' && request.url.startsWith('/api/creator/quizzes')) {
        const url = new URL(request.url, 'http://localhost');
        const id = url.pathname.split('/')[4];
        if (id) return store.get(id) ? json(response, 200, store.get(id)) : json(response, 404, { error: 'Quiz not found' });
        return json(response, 200, store.list(Object.fromEntries(url.searchParams)));
      }
      if (request.method === 'POST' && request.url === '/api/creator/quizzes') {
        return json(response, 201, store.create());
      }
      if (request.method === 'PUT' && request.url.startsWith('/api/creator/quizzes/')) {
        const id = request.url.split('/')[4];
        const input = await readJson(request);
        if (input.id !== id) return json(response, 400, { error: 'Quiz id does not match URL' });
        const saved = store.save(input);
        return saved ? json(response, 200, saved) : json(response, 404, { error: 'Quiz not found' });
      }
      if (request.method === 'POST' && request.url === '/api/answers/validate') {
        const answer = parseSubmitAnswerInput(await readJson(request));
        return json(response, 200, { valid: true, normalized: answer });
      }
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof ContractError || error instanceof SyntaxError || error instanceof TypeError || error instanceof PlayerGameError) {
        return json(response, error.status || 400, { valid: false, error: error.message });
      }
      return json(response, 500, { error: 'Internal server error' });
    }
  });
}

function send(response, status, body, contentType) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function json(response, status, value) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  (await createHarnessServer()).listen(port, host, () => {
    console.log(`Contract harness: http://${host}:${port}`);
  });
}
