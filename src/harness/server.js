import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { harnessState } from './mock-data.js';
import { ContractError, parseSubmitAnswerInput } from '../contracts/index.js';
import { applySchema } from '../db/schema.js';
import { AuthRepository } from '../auth/repository.js';
import { AuthService } from '../auth/service.js';
import { createAuthHandler } from '../auth/http.js';

const pageUrl = new URL('../../public/harness.html', import.meta.url);

export async function createHarnessServer() {
  const database = new DatabaseSync(':memory:');
  await applySchema(database);
  const service = new AuthService(new AuthRepository(database));
  await service.register({ username: 'demo_creator', password: 'correct horse battery staple', displayName: 'Demo Creator' });
  const handleAuth = createAuthHandler(service);
  return createServer(async (request, response) => {
    try {
      if (await handleAuth(request, response)) return;
      if (request.method === 'GET' && request.url === '/') {
        return send(response, 200, await readFile(pageUrl, 'utf8'), 'text/html; charset=utf-8');
      }
      if (request.method === 'GET' && request.url === '/api/state') {
        return json(response, 200, harnessState());
      }
      if (request.method === 'POST' && request.url === '/api/answers/validate') {
        const answer = parseSubmitAnswerInput(await readJson(request));
        return json(response, 200, { valid: true, normalized: answer });
      }
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof ContractError || error instanceof SyntaxError || error instanceof TypeError) {
        return json(response, 400, { valid: false, error: error.message });
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
  (await createHarnessServer()).listen(port, '127.0.0.1', () => {
    console.log(`Contract harness: http://127.0.0.1:${port}`);
  });
}
