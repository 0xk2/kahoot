import { array, ContractError, id, isoDate, object, oneOf, optionalString, string } from './validation.js';

export const USER_ROLES = Object.freeze(['host', 'admin']);

export function parseAuthUser(value, path = 'user') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`),
    username: username(input.username, `${path}.username`),
    displayName: string(input.displayName, `${path}.displayName`, { max: 80 }),
    roles: Object.freeze(array(input.roles, `${path}.roles`, (role, rolePath) =>
      oneOf(role, rolePath, USER_ROLES), { min: 1, max: USER_ROLES.length })),
    createdAt: isoDate(input.createdAt, `${path}.createdAt`)
  });
}

export function parseRegisterInput(value, path = 'register') {
  const input = object(value, path);
  return Object.freeze({
    username: username(input.username, `${path}.username`),
    password: string(input.password, `${path}.password`, { min: 12, max: 128 }),
    displayName: string(input.displayName, `${path}.displayName`, { max: 80 })
  });
}

export function parseLoginInput(value, path = 'login') {
  const input = object(value, path);
  return Object.freeze({
    username: username(input.username, `${path}.username`),
    password: string(input.password, `${path}.password`, { min: 1, max: 128 })
  });
}

function username(value, path) {
  const normalized = string(value, path, { min: 3, max: 32 }).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(normalized)) {
    throw new ContractError(path, 'may contain letters, numbers, underscores, and hyphens');
  }
  return normalized;
}

export function parseAuthSession(value, path = 'authSession') {
  const input = object(value, path);
  return Object.freeze({
    token: string(input.token, `${path}.token`, { min: 32, max: 256 }),
    user: parseAuthUser(input.user, `${path}.user`),
    expiresAt: isoDate(input.expiresAt, `${path}.expiresAt`),
    refreshToken: optionalString(input.refreshToken, `${path}.refreshToken`, { min: 32, max: 256 })
  });
}
