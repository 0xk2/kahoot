const SORTERS = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  title: (a, b) => a.title.localeCompare(b.title),
  questions: (a, b) => b.questions.length - a.questions.length
};

export function quizLibrary(quizzes, { search = '', status = 'all', sort = 'updated' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  const matches = quizzes.filter((quiz) => {
    const searchable = `${quiz.title} ${quiz.description ?? ''}`.toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (status === 'all' || quiz.status === status);
  });
  return [...matches].sort(SORTERS[sort] ?? SORTERS.updated);
}

export function quizSummary(quiz) {
  return Object.freeze({
    id: quiz.id, title: quiz.title, description: quiz.description, status: quiz.status,
    questionCount: quiz.questions.length,
    totalPoints: quiz.questions.reduce((sum, question) => sum + question.points, 0),
    totalSeconds: quiz.questions.reduce((sum, question) => sum + question.timeLimitSeconds, 0),
    updatedAt: quiz.updatedAt
  });
}
