export const SESSION_COOKIE = 'kahoot_session';

export function readSessionCookie(header = '') {
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=') || null;
  }
  return null;
}

export function sessionCookie(token, expiresAt, { secure = false } = {}) {
  const fields = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    `Expires=${new Date(expiresAt).toUTCString()}`];
  if (secure) fields.push('Secure');
  return fields.join('; ');
}

export function expiredSessionCookie({ secure = false } = {}) {
  return sessionCookie('', new Date(0).toISOString(), { secure });
}
