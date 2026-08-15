const $ = (selector) => document.querySelector(selector);
const libraryView = $('#library-view');
const editorView = $('#editor-view');
let quiz;
let activeQuestion = 0;
let display = 'grid';

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

async function loadLibrary() {
  const params = new URLSearchParams({ search: $('#search').value, status: $('#status').value, sort: $('#sort').value });
  const quizzes = await request(`/api/creator/quizzes?${params}`);
  $('#library-count').textContent = `${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'}`;
  $('#quiz-list').className = `quiz-grid ${display === 'list' ? 'list' : ''}`;
  $('#quiz-list').innerHTML = quizzes.length ? quizzes.map((item) => `<button class="quiz-card" data-id="${item.id}">
    <div class="cover">✦</div><div class="card-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description ?? 'No description yet')}</p>
    <div class="meta"><span>${item.questionCount} questions · ${item.totalPoints.toLocaleString()} pts</span><span class="badge">${item.status}</span></div></div></button>`).join('') : '<p>No quizzes match these filters.</p>';
  document.querySelectorAll('.quiz-card').forEach((card) => card.addEventListener('click', () => openEditor(card.dataset.id)));
}

async function openEditor(id) {
  quiz = structuredClone(await request(`/api/creator/quizzes/${id}`));
  activeQuestion = 0;
  libraryView.hidden = true;
  editorView.hidden = false;
  renderEditor();
}

function renderEditor() {
  $('#quiz-title').value = quiz.title;
  $('#quiz-description').value = quiz.description ?? '';
  $('#quiz-status').textContent = quiz.status;
  renderQuestions();
  renderQuestion();
}

function renderQuestions() {
  $('#question-list').innerHTML = quiz.questions.map((question, index) => `<button type="button" class="question-item ${index === activeQuestion ? 'selected' : ''}" data-index="${index}">${index + 1}. ${escapeHtml(question.prompt || 'Untitled question')}</button>`).join('');
  document.querySelectorAll('.question-item').forEach((button) => button.addEventListener('click', () => {
    syncQuestion(); activeQuestion = Number(button.dataset.index); renderQuestions(); renderQuestion();
  }));
}

function renderQuestion() {
  const question = quiz.questions[activeQuestion];
  $('#question-number').textContent = `Question ${activeQuestion + 1} of ${quiz.questions.length}`;
  $('#prompt').value = question.prompt;
  $('#timer').value = question.timeLimitSeconds;
  $('#points').value = question.points;
  $('#options').innerHTML = question.options.map((option, index) => `<label class="option"><input type="checkbox" class="correct" ${option.isCorrect ? 'checked' : ''} aria-label="Mark answer ${index + 1} correct"><input type="text" class="answer-text" value="${escapeHtml(option.text)}" maxlength="240" placeholder="Add answer" required><button type="button" class="remove-answer" data-index="${index}" aria-label="Remove answer ${index + 1}">×</button></label>`).join('');
  document.querySelectorAll('.remove-answer').forEach((button) => button.addEventListener('click', () => removeAnswer(Number(button.dataset.index))));
  document.querySelectorAll('.correct').forEach((input) => input.addEventListener('change', updateAnswerType));
  updateAnswerType();
}

function syncQuestion() {
  const question = quiz.questions[activeQuestion];
  if (!question) return;
  question.prompt = $('#prompt').value.trim();
  question.timeLimitSeconds = Number($('#timer').value);
  question.points = Number($('#points').value);
  document.querySelectorAll('.option').forEach((row, index) => {
    question.options[index].text = row.querySelector('.answer-text').value.trim();
    question.options[index].isCorrect = row.querySelector('.correct').checked;
  });
  question.type = question.options.filter((option) => option.isCorrect).length > 1 ? 'multiple_choice' : 'single_choice';
}

function updateAnswerType() {
  const count = document.querySelectorAll('.correct:checked').length;
  $('#answer-type').textContent = count > 1 ? `Multiple choice · ${count} correct` : 'Single choice';
  dirty();
}

function addQuestion() {
  syncQuestion();
  const suffix = Date.now().toString(36);
  quiz.questions.push({ id: `question-${suffix}`, type: 'single_choice', prompt: '', explanation: null, timeLimitSeconds: 20, points: 1000, position: quiz.questions.length,
    options: [{ id: `answer-${suffix}-1`, text: '', isCorrect: true, position: 0 }, { id: `answer-${suffix}-2`, text: '', isCorrect: false, position: 1 }] });
  activeQuestion = quiz.questions.length - 1; renderEditor(); dirty();
}

function addAnswer() {
  syncQuestion();
  const question = quiz.questions[activeQuestion];
  if (question.options.length >= 10) return toast('A question can have up to 10 answers.');
  question.options.push({ id: `answer-${Date.now().toString(36)}`, text: '', isCorrect: false, position: question.options.length });
  renderQuestion(); dirty();
}

function removeAnswer(index) {
  syncQuestion();
  const options = quiz.questions[activeQuestion].options;
  if (options.length <= 2) return toast('Keep at least two answers.');
  options.splice(index, 1); options.forEach((option, position) => { option.position = position; }); renderQuestion(); dirty();
}

function deleteQuestion() {
  if (quiz.questions.length <= 1) return toast('A quiz needs at least one question.');
  quiz.questions.splice(activeQuestion, 1); quiz.questions.forEach((question, position) => { question.position = position; });
  activeQuestion = Math.max(0, activeQuestion - 1); renderEditor(); dirty();
}

async function save() {
  syncQuestion(); quiz.title = $('#quiz-title').value.trim(); quiz.description = $('#quiz-description').value.trim() || null;
  try {
    quiz = structuredClone(await request(`/api/creator/quizzes/${quiz.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(quiz) }));
    $('#save-state').textContent = 'All changes saved'; toast('Quiz saved'); renderEditor();
  } catch (error) { $('#save-state').textContent = 'Could not save'; toast(error.message); }
}

function dirty() { if (quiz) $('#save-state').textContent = 'Unsaved changes'; }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2400); }
function escapeHtml(value) { return value.replace(/[&<>"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[char]); }

['search', 'status', 'sort'].forEach((id) => $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', loadLibrary));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { display = button.dataset.view; document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('selected', item === button)); loadLibrary(); }));
$('#back').addEventListener('click', () => { editorView.hidden = true; libraryView.hidden = false; loadLibrary(); });
$('#save').addEventListener('click', save); $('#add-question').addEventListener('click', addQuestion); $('#add-answer').addEventListener('click', addAnswer); $('#delete-question').addEventListener('click', deleteQuestion);
$('#editor-form').addEventListener('input', dirty); $('#new-quiz').addEventListener('click', async () => {
  const created = await request('/api/creator/quizzes', { method: 'POST' }); openEditor(created.id);
});
loadLibrary();
