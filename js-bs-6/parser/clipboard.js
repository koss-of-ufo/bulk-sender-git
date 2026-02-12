// js/parser/clipboard.js
export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function showCopied(element) {
  const original = element.innerHTML;
  const originalBg = element.style.background;
  element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%">✅ СКОПИРОВАНО!</div>';
  element.style.background = '#d4edda';
  setTimeout(() => {
    element.innerHTML = original;
    element.style.background = originalBg;
  }, 1200);
}
