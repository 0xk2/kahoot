const sessions = document.querySelector('#sessions');
const message = document.querySelector('#message');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function load() {
  try {
    const rooms = await request('/api/rooms?quizId=quiz-space');
    sessions.innerHTML = rooms.length ? rooms.map(card).join('') : '<p class="empty">No sessions yet.</p>';
  } catch (error) { message.textContent = error.message; }
}

function card(room) {
  const players = room.participants.filter(({ status }) => status !== 'removed');
  return `<article data-pin="${room.joinCode}">
    <p class="eyebrow">Independent session</p><h2>${room.joinCode}</h2>
    <p><strong>Status:</strong> ${room.status} · <strong>Players:</strong> ${players.length}</p>
    <ul>${players.map(({ nickname, status }) => `<li>${escapeHtml(nickname)} <small>${status}</small></li>`).join('') || '<li>No players</li>'}</ul>
    <div class="actions">
      ${room.status === 'lobby' ? '<button data-action="join">Add mock player</button><button data-action="active">Start</button>' : ''}
      ${room.status === 'active' ? '<button data-action="completed">Complete</button>' : ''}
      <a href="/live?host=${room.joinCode}" data-action="open">Open host display</a>
    </div></article>`;
}

document.querySelector('#launch').onclick = async () => {
  try {
    await Promise.all([request('/api/rooms', json({ quizId: 'quiz-space' })), request('/api/rooms', json({ quizId: 'quiz-space' }))]);
    message.textContent = 'Two isolated sessions launched.';
    await load();
  } catch (error) { message.textContent = error.message; }
};
document.querySelector('#refresh').onclick = load;
sessions.onclick = async ({ target }) => {
  const action = target.dataset.action;
  if (!action) return;
  const pin = target.closest('article').dataset.pin;
  try {
    const room = await request(`/api/rooms/${pin}`);
    if (action === 'open') {
      sessionStorage.setItem(`host:${pin}`, String(room.revision));
      return;
    }
    if (action === 'join') await request('/api/rooms/join', json({ joinCode: pin, nickname: `Player ${room.participants.length + 1}`, reconnectToken: null }));
    else await request(`/api/rooms/${pin}/lifecycle`, json({ status: action, expectedRevision: room.revision }));
    message.textContent = `${pin} updated; the other sessions were unchanged.`;
    await load();
  } catch (error) { message.textContent = error.message; }
};

function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
load();
