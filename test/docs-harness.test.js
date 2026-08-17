import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

test('documentation harness summarizes workflows and links auth-free surfaces', async (context) => {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const [pageResponse, styleResponse] = await Promise.all([
    fetch(`${origin}/docs`), fetch(`${origin}/docs.css`)
  ]);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.match(page, /R6-1 documentation harness/);
  assert.match(page, /A Tiny Tour of Space/);
  assert.match(page, /href="\/creator"/);
  assert.match(page, /href="\/live"/);
  assert.match(page, /href="\/play\?pin=ORBIT1"/);
  assert.match(page, /npm run check/);
  assert.match(await styleResponse.text(), /grid-template-columns:repeat\(3,1fr\)/);
});
