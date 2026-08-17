import { ContractError } from '../contracts/index.js';

export function createCreatorHandler(repository, authenticate) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/creator/quizzes')) return false;
    const user = authenticate(request);
    if (!user) return json(response, 401, { error: 'Authentication required' });
    const id = url.pathname.split('/')[4];
    try {
      if (request.method === 'GET' && id) {
        const quiz = repository.get(id, user.id);
        return json(response, quiz ? 200 : 404, quiz ?? { error: 'Quiz not found' });
      }
      if (request.method === 'GET') return json(response, 200, repository.list(user.id, Object.fromEntries(url.searchParams)));
      if (request.method === 'POST' && !id) return json(response, 201, repository.create(user.id));
      if (request.method === 'PUT' && id) {
        const input = await readJson(request);
        if (input.id !== id) return json(response, 400, { error: 'Quiz id does not match URL' });
        const saved = repository.save(input, user.id);
        return json(response, saved ? 200 : 404, saved ?? { error: 'Quiz not found' });
      }
      return false;
    } catch (error) {
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
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
