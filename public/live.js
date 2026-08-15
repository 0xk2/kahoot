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
  $('#host-pin').textContent = room.joinCode; $('#join-link').textContent = room.joinUrl;
  $('#join-link').href = room.joinUrl; $('#qr').src = room.qrImageUrl;
  $('#host-status').textContent = statusText(room); $('#count').textContent = `${active(room).length}/${room.maxPlayers}`;
  $('#players').innerHTML = active(room).map((player) => `<div class="player"><span>${escapeHtml(player.nickname)}<small>${player.status}</small></span><button data-remove="${player.id}">Remove</button></div>`).join('') || '<p>Waiting for players…</p>';
  document.querySelectorAll('[data-remove]').forEach((button) => button.onclick = () => remove(button.dataset.remove));
  $('#start').disabled = room.status !== 'lobby'; $('#complete').disabled = room.status !== 'active';
  $('#cancel').disabled = !['lobby', 'active'].includes(room.status);
}

function renderPlayer(room, nickname) {
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
    const room = await request(`/api/rooms/${pin}`);
    if (role === 'host') renderHost(room); else renderPlayer(room, saved(pin)?.nickname ?? 'Player');
  } catch (error) { message(error); }
  timer = setTimeout(poll, 1000);
}

async function transition(status) { try { renderHost(await request(`/api/rooms/${pin}/lifecycle`, json('POST', { status }))); } catch (error) { message(error); } }
async function remove(id) { try { renderHost(await request(`/api/rooms/${pin}/participants/${id}`, { method: 'DELETE' })); } catch (error) { message(error); } }
$('#start').onclick = () => transition('active'); $('#complete').onclick = () => transition('completed'); $('#cancel').onclick = () => transition('cancelled');
$('#disconnect').onclick = async () => {
  try {
    await request(`/api/rooms/${pin}/disconnect`, json('POST', { reconnectToken: token }));
    $('#player-status').textContent = 'Disconnected. Reconnecting…';
    const state = saved(pin); setTimeout(() => join(pin, state.nickname, state.token).catch(message), 700);
  } catch (error) { message(error); }
};

function active(room) { return room.participants.filter((player) => player.status !== 'removed'); }
function saved(code) { try { return JSON.parse(localStorage.getItem(`room:${code}`)); } catch { return null; } }
function show(selector) { $('#welcome').hidden = true; $('#host').hidden = selector !== '#host'; $('#player').hidden = selector !== '#player'; }
function message(error) { $('#message').textContent = error.message ?? String(error); }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

const queryPin = new URLSearchParams(location.search).get('pin');
if (queryPin) { $('#pin').value = queryPin.toUpperCase(); const state = saved(queryPin.toUpperCase()); if (state) join(queryPin, state.nickname, state.token).catch(message); }
