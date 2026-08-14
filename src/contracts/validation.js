export class ContractError extends TypeError {
  constructor(path, message) {
    super(`${path} ${message}`);
    this.name = 'ContractError';
    this.path = path;
  }
}

export function object(value, path = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(path, 'must be an object');
  }
  return value;
}

export function string(value, path, { min = 1, max = Infinity } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ContractError(path, `must be a string between ${min} and ${max} characters`);
  }
  return value;
}

export function optionalString(value, path, options) {
  return value == null ? null : string(value, path, options);
}

export function id(value, path) {
  return string(value, path, { min: 1, max: 64 });
}

export function oneOf(value, path, choices) {
  if (!choices.includes(value)) {
    throw new ContractError(path, `must be one of: ${choices.join(', ')}`);
  }
  return value;
}

export function integer(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ContractError(path, `must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function boolean(value, path) {
  if (typeof value !== 'boolean') throw new ContractError(path, 'must be a boolean');
  return value;
}

export function array(value, path, itemParser, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ContractError(path, `must contain between ${min} and ${max} items`);
  }
  return value.map((item, index) => itemParser(item, `${path}[${index}]`));
}

export function isoDate(value, path) {
  string(value, path);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) {
    throw new ContractError(path, 'must be an ISO-8601 UTC timestamp');
  }
  return value;
}

export function nullable(value, parser, path) {
  return value == null ? null : parser(value, path);
}
