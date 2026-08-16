const form = document.querySelector('#join-form');
const pinInput = document.querySelector('#room-pin');
const error = document.querySelector('#pin-error');

pinInput.addEventListener('input', () => {
  pinInput.value = pinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  error.textContent = '';
  pinInput.removeAttribute('aria-invalid');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const pin = pinInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(pin)) {
    error.textContent = 'Enter a valid room PIN (4–12 letters or numbers).';
    pinInput.setAttribute('aria-invalid', 'true');
    pinInput.focus();
    return;
  }
  window.location.assign(`/play?pin=${encodeURIComponent(pin)}`);
});
