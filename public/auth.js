let registering = false;
const form = document.querySelector('#auth-form');
document.querySelector('#mode').onclick = () => {
  registering = !registering;
  document.querySelector('#heading').textContent = registering ? 'Create account' : 'Sign in';
  document.querySelector('#display-row').hidden = !registering;
  document.querySelector('[name="displayName"]').required = registering;
  document.querySelector('#mode').textContent = registering ? 'Already registered? Sign in' : 'Need an account? Register';
};
form.onsubmit = async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  if (!registering) delete body.displayName;
  const response = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) return document.querySelector('#error').textContent = result.error;
  location.href = new URLSearchParams(location.search).get('next') || '/creator';
};
