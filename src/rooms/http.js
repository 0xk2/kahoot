import { ContractError } from '../contracts/index.js';
import { RoomError } from './errors.js';

export function createRoomHandler(service, { authenticate, findQuiz, createHarnessResults } = {}) {
  return async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const host = authenticate?.(request);
        if (!host) throw new RoomError('Authentication required', 401);
        const input = await readJson(request);
        const quiz = findQuiz?.(input.quizId);
        if (!quiz || quiz.ownerId !== host.id) throw new RoomError('Quiz not found', 404);
        if (quiz.status !== 'published') throw new RoomError('Only published quizzes can be hosted', 409);
        const origin = `http://${request.headers.host}`;
        return json(response, 201, service.create(input, host.id, origin));
      }
      if (request.method === 'POST' && url.pathname === '/api/rooms/join') {
        return json(response, 200, service.join(await readJson(request)));
      }
      if (request.method === 'GET' && url.pathname === '/api/host/sessions') {
        const host = authenticate?.(request);
        const sessions = service.list(host?.id).map((room) => ({
          ...room,
          quiz: quizSummary(findQuiz?.(room.quizId)),
          results: room.status === 'completed' ? standings(room.participants) : null
        }));
        return json(response, 200, sessions);
      }
      const hostRoom = url.pathname.match(/^\/api\/host\/rooms\/([A-Z0-9]{6})$/i);
      if (request.method === 'GET' && hostRoom) {
        const host = authenticate?.(request);
        const room = service.list(host?.id).find(({ joinCode }) => joinCode === hostRoom[1].toUpperCase());
        if (!room) throw new RoomError('Room not found', 404);
        return json(response, 200, { ...room, quiz: hostQuiz(findQuiz?.(room.quizId)) });
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(.*))?$/i);
      if (!match) return false;
      const [, pin, action] = match;
      if (request.method === 'GET' && !action) return json(response, 200, service.get(pin));
      if (request.method === 'POST' && action === 'lifecycle') {
        const host = authenticate?.(request);
        const input = await readJson(request);
        return json(response, 200, service.transition(pin, input.status, host?.id, input.expectedRevision));
      }
      if (request.method === 'POST' && action === 'advance') {
        const host = authenticate?.(request);
        const input = await readJson(request);
        const room = service.get(pin);
        const quiz = findQuiz?.(room.quizId);
        if (!quiz) throw new RoomError('Quiz not found', 404);
        return json(response, 200, service.advance(pin, host?.id, input.expectedRevision, quiz.questions.length));
      }
      if (request.method === 'POST' && action === 'harness/results' && createHarnessResults) {
        const host = authenticate?.(request);
        const input = await readJson(request);
        const room = service.get(pin);
        return json(response, 200, service.recordQuestionResults(pin,
          createHarnessResults(room), host?.id, input.expectedRevision));
      }
      if (request.method === 'POST' && action === 'disconnect') {
        return json(response, 200, service.disconnect(pin, (await readJson(request)).reconnectToken));
      }
      if (request.method === 'DELETE' && action?.startsWith('participants/')) {
        const host = authenticate?.(request);
        return json(response, 200, service.remove(pin, action.split('/')[1], host?.id,
          Number(request.headers['if-match'])));
      }
      return false;
    } catch (error) {
      if (error instanceof RoomError) return json(response, error.status, { error: error.message });
      if (error instanceof ContractError || error instanceof SyntaxError) return json(response, 400, { error: error.message });
      throw error;
    }
  };
}

function quizSummary(quiz) {
  return quiz ? { id: quiz.id, title: quiz.title, questionCount: quiz.questions.length } : null;
}

function hostQuiz(quiz) {
  return quiz ? { id: quiz.id, title: quiz.title, questions: quiz.questions.map((question) => ({
    id: question.id, prompt: question.prompt, type: question.type, points: question.points,
    options: question.options.map(({ id, text }) => ({ id, text }))
  })) } : null;
}

function standings(participants) {
  let previousScore;
  let rank = 0;
  return participants.filter(({ status }) => status !== 'removed')
    .sort((left, right) => right.score - left.score || left.nickname.localeCompare(right.nickname))
    .map((participant, index) => {
      if (participant.score !== previousScore) rank = index + 1;
      previousScore = participant.score;
      return { rank, participantId: participant.id, nickname: participant.nickname, score: participant.score };
    });
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
  return true;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new ContractError('request', 'is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
