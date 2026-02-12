// js/utils.js
export const uuidRegex = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/;

export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export async function waitWhilePaused(state) {
  while (state.paused && state.running) {
    await sleep(200);
  }
}

export function detectSeparator(line) {
  if (line.indexOf(';') !== -1) return ';';
  if (line.indexOf(',') !== -1) return ',';
  if (line.indexOf('\t') !== -1) return '\t';
  return / +/;
}

export function extractUUIDsFromString(s) {
  const matches = s.match(new RegExp(uuidRegex, 'g'));
  if (matches && matches.length) return matches;
  const tokens = s.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
  return tokens;
}

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

export function cyrToLatPan(pan) {
  if (!pan) return pan;

  const map = {
    'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M',
    'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y'
  };

  return pan
    .toUpperCase()
    .split('')
    .map(ch => map[ch] || ch)
    .join('');
}
