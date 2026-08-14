import { readFile } from 'node:fs/promises';

const schemaUrl = new URL('../../db/schema.sql', import.meta.url);

export function readSchema() {
  return readFile(schemaUrl, 'utf8');
}

export async function applySchema(database) {
  const schema = await readSchema();
  database.exec(schema);
}
