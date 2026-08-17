export const APP_NAME = 'Quizzes';

export function pageTitle(view) {
  const label = view?.trim();
  return label ? `${label} | ${APP_NAME}` : APP_NAME;
}
