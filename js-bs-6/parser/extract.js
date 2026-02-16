// js/parser/extract.js
const cyrillicToLatinMap = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'а': 'A', 'в': 'B', 'е': 'E', 'к': 'K', 'м': 'M', 'н': 'H', 'о': 'O', 'р': 'P', 'с': 'C', 'т': 'T', 'у': 'Y', 'х': 'X'
};

export function convertCyrillicToLatin(text) {
  let r = '';
  for (const ch of text) r += cyrillicToLatinMap[ch] || ch;
  return r.toUpperCase();
}

export function extractNumbers(text) {
  const patterns = [
    /(\b\d{5}\s+\d{5}\s+\d{5}\s+\d{5}\s+\d{5,}\b)/gi,
    /(\b\d{20,}\b)/g
  ];
  let allMatches = [];
  patterns.forEach(p => allMatches.push(...(text.match(p) || [])));

  return [...new Set(allMatches)]
    .map(n => n.replace(/\s+/g, ''))
    .filter(n => n.length >= 20 && /^\d+$/.test(n));
}

export function extractUUIDs(text) {
  const matches = text.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/gi) || [];
  return [...new Set(matches.map(u => u.toLowerCase()))];
}

export function extractGRZ(text) {
  const re = /[АВЕКМНОРСТУХABEKMHOPCTYX]\s*\d{3}\s*[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s*\d{2,3}/gi;
  const found = text.match(re) || [];
  return [...new Set(found.map(g => convertCyrillicToLatin(g).replace(/\s+/g, '')))];
}
