const themeButton = document.querySelector('#themeBtn');
const helloButton = document.querySelector('#helloBtn');
const statusMessage = document.querySelector('#status');

function setTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.innerHTML = `${dark ? 'โหมดสว่าง' : 'โหมดมืด'} <span aria-hidden="true">◐</span>`;
}

let savedTheme;
try { savedTheme = localStorage.getItem('nutrithai-showcase-theme'); } catch { /* Theme works even when storage is unavailable. */ }
setTheme(savedTheme === 'dark' || savedTheme === 'light'
  ? savedTheme
  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('nutrithai-showcase-theme', theme); } catch { /* No storage permission is required. */ }
});

helloButton.addEventListener('click', () => {
  statusMessage.textContent = 'Hello from GitHub Pages! สวัสดีจาก นพรัตน์ โพธิ์สาวัง 🌿';
});
