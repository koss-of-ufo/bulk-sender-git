// js-bs-6/tema.js
// Theme switcher (light/dark) with persistence + optional system-follow

const STORAGE_KEY = 'bs_theme';
const root = document.documentElement;
const btnId = 'themeToggle';

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  root.setAttribute('data-theme', t);
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  updateButton(t);
}

function updateButton(theme) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.textContent = theme === 'dark' ? '🌙 Тёмная' : '☀️ Светлая';
  btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}

function getSavedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (v === 'light' || v === 'dark') ? v : null;
  } catch {
    return null;
  }
}

function getSystemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light';
}

function initTheme() {
  const saved = getSavedTheme();
  applyTheme(saved ?? getSystemTheme());
}

function initToggleHandler() {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// Опционально: если пользователь НЕ выбирал тему вручную,
// то следуем системной при смене prefers-color-scheme.
function initSystemFollow() {
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (!mq || !mq.addEventListener) return;

  mq.addEventListener('change', () => {
    const saved = getSavedTheme();
    if (saved) return; // пользователь выбрал сам — не трогаем
    applyTheme(mq.matches ? 'dark' : 'light');
  });
}

// Скрипт подключается внизу body как type="module", DOM уже готов.
// Если вдруг подключишь его в head — всё равно отработает корректно.
initTheme();
initToggleHandler();
initSystemFollow();
