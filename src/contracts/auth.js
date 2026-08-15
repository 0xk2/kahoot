import { array, id, isoDate, object, oneOf, optionalString, string } from './validation.js';

export const USER_ROLES = Object.freeze(['host', 'admin']);

export function parseAuthUser(value, path = 'user') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`),
    email: string(input.email, `${path}.email`, { max: 254 }),
    displayName: string(input.displayName, `${path}.displayName`, { max: 80 }),
    roles: Object.freeze(array(input.roles, `${path}.roles`, (role, rolePath) =>
      oneOf(role, rolePath, USER_ROLES), { min: 1, max: USER_ROLES.length })),
    createdAt: isoDate(input.createdAt, `${path}.createdAt`)
  });
}

export function parseRegisterInput(value, path = 'register') {
  const input = object(value, path);
  return Object.freeze({
    email: string(input.email, `${path}.email`, { min: 3, max: 254 }).toLowerCase(),
    password: string(input.password, `${path}.password`, { min: 12, max: 128 }),
    displayName: string(input.displayName, `${path}.displayName`, { max: 80 })
  });
}

export function parseLoginInput(value, path = 'login') {
  const input = object(value, path);
  return Object.freeze({
    email: string(input.email, `${path}.email`, { min: 3, max: 254 }).toLowerCase(),
    password: string(input.password, `${path}.password`, { min: 1, max: 128 })
  });
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
