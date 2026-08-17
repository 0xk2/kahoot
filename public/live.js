import { pageTitle } from './page-titles.js';

const $ = (selector) => document.querySelector(selector);
let role;
let pin;
let token;
let timer;

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

function json(method, value) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

$('#host-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const room = await request('/api/rooms', json('POST', { quizId: 'quiz-space' }));
    role = 'host'; pin = room.joinCode; show('#host'); renderHost(room); poll();
  } catch (error) { message(error); }
});

$('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await join($('#pin').value, $('#nickname').value, null); } catch (error) { message(error); }
});

async function join(joinCode, nickname, reconnectToken) {
  const result = await request('/api/rooms/join', json('POST', { joinCode, nickname, reconnectToken }));
  role = 'player'; pin = result.room.joinCode; token = result.reconnectToken;
  localStorage.setItem(`room:${pin}`, JSON.stringify({ nickname: result.participant.nickname, token }));
  show('#player'); renderPlayer(result.room, result.participant.nickname); poll();
}

function renderHost(room) {
  document.title = pageTitle(`Host ${room.joinCode}`);
  sessionStorage.setItem(`host:${room.joinCode}`, String(room.revision));
  $('#host-pin').textContent = room.joinCode; $('#join-link').textContent = room.joinUrl;
  $('#join-link').href = room.joinUrl; $('#qr').src = room.qrImageUrl;
  $('#host-status').textContent = statusText(room); $('#count').textContent = `${active(room).length}/${room.maxPlayers}`;
  $('#players').innerHTML = active(room).map((player) => `<div class="player"><span>${escapeHtml(player.nickname)}<small>${player.status}</small></span><button data-remove="${player.id}">Remove</button></div>`).join('') || '<p>Waiting for players…</p>';
  document.querySelectorAll('[data-remove]').forEach((button) => button.onclick = () => remove(button.dataset.remove));
  $('#start').disabled = room.status !== 'lobby'; $('#complete').disabled = room.status !== 'active';
  $('#cancel').disabled = !['lobby', 'active'].includes(room.status);
  renderQuestion(room);
}

function renderQuestion(room) {
  const control = $('#question-control');
  control.hidden = room.status !== 'active' || !room.quiz;
  if (control.hidden) return;
  const question = room.quiz.questions[room.currentQuestionIndex];
  const recorded = room.questionResults.find(({ questionIndex }) => questionIndex === room.currentQuestionIndex);
  $('#question-number').textContent = `Question ${room.currentQuestionIndex + 1} of ${room.quiz.questions.length}`;
  $('#question-prompt').textContent = question.prompt;
  $('#question-options').innerHTML = question.options.map(({ text }) => `<div>${escapeHtml(text)}</div>`).join('');
  $('#reveal').hidden = Boolean(recorded); $('#next').hidden = !recorded || room.currentQuestionIndex === room.quiz.questions.length - 1;
  $('#complete').disabled = !recorded || room.currentQuestionIndex !== room.quiz.questions.length - 1;
  $('#question-results').hidden = !recorded;
  if (!recorded) return;
  const players = active(room);
  $('#points-list').innerHTML = recorded.results.map((result) => {
    const player = players.find(({ id }) => id === result.participantId);
    return `<div><span>${result.correct ? '✓' : '×'} ${escapeHtml(player?.nickname ?? 'Removed player')}</span><strong>+${result.points.toLocaleString()}</strong></div>`;
  }).join('');
  $('#leaderboard').innerHTML = rankings(players).map(({ rank, nickname, score }) => `<li><b>${rank}</b><span>${escapeHtml(nickname)}</span><strong>${score.toLocaleString()} pts</strong></li>`).join('');
}

function renderPlayer(room, nickname) {
  document.title = pageTitle(`Lobby ${room.joinCode}`);
  $('#player-title').textContent = `${nickname}, you’re in!`;
  $('#player-status').textContent = statusText(room);
  $('#disconnect').disabled = !['lobby', 'active'].includes(room.status);
}

function statusText(room) {
  return ({ lobby: 'Waiting for the host to start…', active: 'Game started!', completed: 'Game completed.', cancelled: 'The host cancelled this room.' })[room.status];
}

async function poll() {
  clearTimeout(timer);
  try {
    const room = await request(role === 'host' ? `/api/host/rooms/${pin}` : `/api/rooms/${pin}`);
    if (role === 'host') renderHost(room); else renderPlayer(room, saved(pin)?.nickname ?? 'Player');
  } catch (error) { message(error); }
  timer = setTimeout(poll, 1000);
}

function revision() { return Number(sessionStorage.getItem(`host:${pin}`)); }
async function transition(status) { try { renderHost(await request(`/api/rooms/${pin}/lifecycle`, json('POST', { status, expectedRevision: revision() }))); } catch (error) { message(error); poll(); } }
async function remove(id) { try { renderHost(await request(`/api/rooms/${pin}/participants/${id}`, { method: 'DELETE', headers: { 'if-match': String(revision()) } })); } catch (error) { message(error); poll(); } }
async function hostAction(action) { try { await request(`/api/rooms/${pin}/${action}`, json('POST', { expectedRevision: revision() })); await poll(); } catch (error) { message(error); poll(); } }
$('#start').onclick = () => transition('active'); $('#complete').onclick = () => transition('completed'); $('#cancel').onclick = () => transition('cancelled');
$('#reveal').onclick = () => hostAction('harness/results'); $('#next').onclick = () => hostAction('advance');
$('#disconnect').onclick = async () => {
  try {
    await request(`/api/rooms/${pin}/disconnect`, json('POST', { reconnectToken: token }));
    $('#player-status').textContent = 'Disconnected. Reconnecting…';
    const state = saved(pin); setTimeout(() => join(pin, state.nickname, state.token).catch(message), 700);
  } catch (error) { message(error); }
};

function active(room) { return room.participants.filter((player) => player.status !== 'removed'); }
function rankings(players) {
  let previous; let rank = 0;
  return [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)).map((player, index) => {
    if (player.score !== previous) rank = index + 1;
    previous = player.score;
    return { ...player, rank };
  });
}
function saved(code) { try { return JSON.parse(localStorage.getItem(`room:${code}`)); } catch { return null; } }
function show(selector) { $('#welcome').hidden = true; $('#host').hidden = selector !== '#host'; $('#player').hidden = selector !== '#player'; }
function message(error) { $('#message').textContent = error.message ?? String(error); }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

const queryPin = new URLSearchParams(location.search).get('pin');
if (queryPin) { $('#pin').value = queryPin.toUpperCase(); const state = saved(queryPin.toUpperCase()); if (state) join(queryPin, state.nickname, state.token).catch(message); }
const hostPin = new URLSearchParams(location.search).get('host');
if (hostPin) {
  role = 'host'; pin = hostPin.toUpperCase(); show('#host'); poll();
}
