import { ContractError } from '../contracts/index.js';
import { AuthenticationError, UsernameTakenError } from './service.js';
import { expiredSessionCookie, readSessionCookie, sessionCookie } from './cookies.js';

export function createAuthHandler(service, { secureCookies = false } = {}) {
  return async function handle(request, response) {
    const token = readSessionCookie(request.headers.cookie);
    try {
      if (request.method === 'POST' && request.url === '/api/auth/register') {
        const result = await service.register(await readJson(request));
        return sendSession(response, 201, result, secureCookies);
      }
      if (request.method === 'POST' && request.url === '/api/auth/login') {
        const result = await service.login(await readJson(request));
        return sendSession(response, 200, result, secureCookies);
      }
      if (request.method === 'GET' && request.url === '/api/auth/me') {
        const user = service.authenticate(token);
        return json(response, user ? 200 : 401, user ? { user } : { error: 'Authentication required' });
      }
      if (request.method === 'POST' && request.url === '/api/auth/logout') {
        service.logout(token);
        return json(response, 204, null, { 'set-cookie': expiredSessionCookie({ secure: secureCookies }) });
      }
      return false;
    } catch (error) {
      if (error instanceof AuthenticationError) return json(response, 401, { error: error.message });
      if (error instanceof UsernameTakenError) return json(response, 409, { error: error.message });
      if (error instanceof ContractError || error instanceof SyntaxError) {
        return json(response, 400, { error: error.message });
      }
      throw error;
    }
  };
}

function sendSession(response, status, result, secure) {
  return json(response, status, { user: result.user, expiresAt: result.expiresAt }, {
    'set-cookie': sessionCookie(result.token, result.expiresAt, { secure })
  });
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(status === 204 ? '' : JSON.stringify(value));
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
