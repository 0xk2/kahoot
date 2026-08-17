import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { applySchema } from './db/schema.js';
import { AuthRepository } from './auth/repository.js';
import { AuthService } from './auth/service.js';
import { createAuthHandler } from './auth/http.js';
import { readSessionCookie } from './auth/cookies.js';
import { QuizRepository } from './creator/repository.js';
import { createCreatorHandler } from './creator/http.js';
import { RoomRepository } from './rooms/repository.js';
import { DurableRoomService } from './rooms/durable-service.js';
import { createRoomHandler } from './rooms/http.js';
import { DurablePlayerGame } from './player/durable-game.js';
import { createPlayerHandler } from './player/http.js';

const publicRoot = new URL('../public/', import.meta.url);
const pages = { '/': 'landing.html', '/auth': 'auth.html', '/creator': 'creator.html',
  '/host': 'host.html', '/live': 'live.html', '/play': 'app-player.html' };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

export async function createProductionServer({ database, databasePath, clock, revision = process.env.APP_REVISION || 'development' } = {}) {
  if (!database && !databasePath) throw new Error('A durable databasePath is required');
  if (databasePath) await mkdir(dirname(databasePath), { recursive: true });
  const db = database ?? new DatabaseSync(databasePath);
  await applySchema(db);
  const auth = new AuthService(new AuthRepository(db), clock ? { now: () => new Date(clock()) } : {});
  const quizzes = new QuizRepository(db, clock);
  const roomRepository = new RoomRepository(db);
  const findQuiz = (id) => quizzes.find(id);
  const rooms = new DurableRoomService(roomRepository, findQuiz, { ...(clock ? { clock: () => new Date(clock()) } : {}) });
  const game = new DurablePlayerGame(db, roomRepository, findQuiz, { ...(clock ? { clock: () => new Date(clock()) } : {}) });
  const authenticate = (request) => auth.authenticate(readSessionCookie(request.headers.cookie));
  const authHandler = createAuthHandler(auth, { secureCookies: process.env.NODE_ENV === 'production' });
  const creatorHandler = createCreatorHandler(quizzes, authenticate);
  const roomHandler = createRoomHandler(rooms, { authenticate, findQuiz });
  const playerHandler = createPlayerHandler(game, rooms);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/revision') return json(response, 200, { revision });
      if (await authHandler(request, response) || await creatorHandler(request, response) ||
        await roomHandler(request, response) || await playerHandler(request, response)) return;
      if (request.method !== 'GET') return json(response, 404, { error: 'Not found' });
      if (url.pathname === '/creator' && !authenticate(request)) {
        response.writeHead(302, { location: '/auth?next=/creator' }); return response.end();
      }
      return serveAsset(response, pages[url.pathname] || url.pathname.slice(1));
    } catch (error) {
      console.error(error);
      return json(response, 500, { error: 'Internal server error' });
    }
  });
  server.on('close', () => { if (!database) db.close(); });
  return server;
}

async function serveAsset(response, name) {
  const allowed = new Set(['landing.css', 'landing.js', 'page-titles.js', 'auth.js', 'creator.css', 'creator.js',
    'host.css', 'host.js', 'live.css', 'live.js', 'player.css', 'app-player.js']);
  if (!Object.values(pages).includes(name) && !allowed.has(name)) return json(response, 404, { error: 'Not found' });
  let body = await readFile(new URL(name, publicRoot), 'utf8');
  if (name === 'landing.html') body = body.replace(/<p class="harness-note">[\s\S]*?<\/p>/, '');
  if (name === 'live.js') body = productionLiveScript(body);
  response.writeHead(200, { 'content-type': types[extname(name)] }); response.end(body);
}

function productionLiveScript(source) {
  return source.replace(
    "  const recorded = room.questionResults.find(({ questionIndex }) => questionIndex === room.currentQuestionIndex);",
    "  const recorded = null;")
    .replace("  $('#reveal').hidden = Boolean(recorded); $('#next').hidden = !recorded || room.currentQuestionIndex === room.quiz.questions.length - 1;\n  $('#complete').disabled = !recorded || room.currentQuestionIndex !== room.quiz.questions.length - 1;\n  $('#question-results').hidden = !recorded;\n  if (!recorded) return;",
      "  $('#reveal').hidden = true; $('#next').hidden = room.currentQuestionIndex === room.quiz.questions.length - 1;\n  $('#complete').disabled = room.currentQuestionIndex !== room.quiz.questions.length - 1;\n  $('#question-results').hidden = true;\n  return;");
}
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value)); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const databasePath = process.env.QUIZZES_DATABASE;
  if (!databasePath) throw new Error('QUIZZES_DATABASE must point to durable SQLite storage');
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  (await createProductionServer({ databasePath })).listen(port, host, () => console.log(`Quizzes: http://${host}:${port}`));
}
