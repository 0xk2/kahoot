import { ContractError } from '../contracts/index.js';
import { PlayerGameError } from './game.js';

export function createPlayerHandler(game, rooms) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'POST' && url.pathname === '/api/player/join') {
        return json(response, 201, rooms.join(await readJson(request)));
      }
      if (request.method === 'GET' && url.pathname === '/api/player/state') {
        return json(response, 200, game.state(url.searchParams.get('participantId'), url.searchParams.get('reconnectToken')));
      }
      if (request.method === 'POST' && url.pathname === '/api/player/answer') {
        return json(response, 200, game.answer(await readJson(request)));
      }
      return false;
    } catch (error) {
      if (error instanceof PlayerGameError || error instanceof ContractError || error instanceof SyntaxError) {
        return json(response, error.status || 400, { error: error.message });
      }
      throw error;
    }
  };
}
function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
  return true;
}
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
