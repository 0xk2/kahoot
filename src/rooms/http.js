import { ContractError } from '../contracts/index.js';
import { RoomError } from './errors.js';

export function createRoomHandler(service) {
  return async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const origin = `http://${request.headers.host}`;
        return json(response, 201, service.create(await readJson(request), 'user-host', origin));
      }
      if (request.method === 'POST' && url.pathname === '/api/rooms/join') {
        return json(response, 200, service.join(await readJson(request)));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(.*))?$/i);
      if (!match) return false;
      const [, pin, action] = match;
      if (request.method === 'GET' && !action) return json(response, 200, service.get(pin));
      if (request.method === 'POST' && action === 'lifecycle') {
        return json(response, 200, service.transition(pin, (await readJson(request)).status));
      }
      if (request.method === 'POST' && action === 'disconnect') {
        return json(response, 200, service.disconnect(pin, (await readJson(request)).reconnectToken));
      }
      if (request.method === 'DELETE' && action?.startsWith('participants/')) {
        return json(response, 200, service.remove(pin, action.split('/')[1]));
      }
      return false;
    } catch (error) {
      if (error instanceof RoomError) return json(response, error.status, { error: error.message });
      if (error instanceof ContractError || error instanceof SyntaxError) return json(response, 400, { error: error.message });
      throw error;
    }
  };
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
