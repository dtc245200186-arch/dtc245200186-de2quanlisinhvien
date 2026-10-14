document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('#toggle-password');
  const input = document.querySelector('#password');
  if (!button || !input) return;
  button.addEventListener('click', () => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Ẩn' : 'Hiện';
    button.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });
});
