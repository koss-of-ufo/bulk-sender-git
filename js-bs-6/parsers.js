import { uuidRegex, cyrToLatPan, detectSeparator } from './utils.js';

export function parsePanText(text) {
  const lines = text.split(/\r?\n/);

  const rows = [];
  let currentPan = '';
  let pendingUuids = [];

  const uuidRe = new RegExp(uuidRegex, 'gi');

  // Больше вариантов написания PAN и команды.
  // Примеры, которые матчятся:
  // - "Сменить PAN на ABC123"
  // - "PAN: ABC123"
  // - "пан = АВС123"
  // - "поменять пан -> 123QWE"
  // - "установить PAN в ABC123"
  const panRe = /(?:^|[\s,;:()«»"'])(?:(?:сменить|заменить|изменить|поменять|скорректировать|установить)\s*)?(?:pan|пан)\s*(?:[:=→>-]*\s*(?:на|в)?\s*)?([A-Z0-9А-ЯЁ]{3,})\b/iu;

  // Иногда пишут: "на PAN ABC123" или "на пан ABC123"
  const panAltRe = /\b(?:на|в)\s*(?:pan|пан)\s*[:=→>-]*\s*([A-Z0-9А-ЯЁ]{3,})\b/iu;

  function extractUuids(line) {
    return line.match(uuidRe) || [];
  }

  function extractPan(line) {
    const m1 = line.match(panRe);
    const m2 = line.match(panAltRe);
    const raw = (m1 && m1[1]) || (m2 && m2[1]) || '';
    const pan = cyrToLatPan(raw.trim());
    return pan || '';
  }

  function pushRows(uuids, pan) {
    if (!pan) return;
    for (const u of uuids) rows.push({ transaction_uuid: u, pan });
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const uuids = extractUuids(line);
    const pan = extractPan(line);

    // Если PAN найден — обновляем currentPan
    if (pan) {
      currentPan = pan;

      // Если были UUID "до PAN" — применяем новый PAN к ним
      if (pendingUuids.length) {
        pushRows(pendingUuids, currentPan);
        pendingUuids = [];
      }

      // UUID, которые в этой же строке
      if (uuids.length) {
        pushRows(uuids, currentPan);
      }

      continue;
    }

    // PAN нет, но UUID есть
    if (uuids.length) {
      if (currentPan) {
        pushRows(uuids, currentPan);
      } else {
        // Пока PAN не задан — копим
        pendingUuids.push(...uuids);
      }
    }
  }

  // Если текст закончился, а PAN так и не встретили — pendingUuids игнорируем
  return rows;
}

function splitCsvLine(line, separator) {
  if (separator instanceof RegExp) {
    return line.trim().split(separator).filter(Boolean);
  }

  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === separator) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function isLikelyHeader(cells, nextCells) {
  if (!cells.length) return false;

  const hasAlpha = cells.some(cell => /[a-zA-Z_]/.test(cell));
  const hasNonUuid = cells.some(cell => {
    const trimmed = cell.trim();
    return trimmed.length > 0 && !uuidRegex.test(trimmed);
  });
  const nextHasUuid = (nextCells || []).some(cell => uuidRegex.test(cell.trim()));

  if (hasAlpha && hasNonUuid) return true;
  if (hasNonUuid && nextHasUuid) return true;
  return false;
}

export function parseCSVTextGeneric(text, useFirstColIfHeader = true) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { rows: [], header: null };
  }

  const separator = detectSeparator(lines[0]);
  const firstCells = splitCsvLine(lines[0], separator);
  const secondCells = lines[1] ? splitCsvLine(lines[1], separator) : [];

  const hasHeader = isLikelyHeader(firstCells, secondCells);
  const header = hasHeader
    ? firstCells.map((cell, index) => cell.trim() || `col${index + 1}`)
    : null;

  const startIndex = hasHeader ? 1 : 0;
  const rows = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], separator);
    if (!cells.length) continue;

    if (header) {
      const row = {};
      header.forEach((key, index) => {
        row[key] = cells[index] ?? '';
      });
      rows.push(row);
      continue;
    }

    const row = {};
    if (useFirstColIfHeader) {
      row.transaction_uuid = cells[0] ?? '';
    }
    cells.forEach((value, index) => {
      row[`col${index + 1}`] = value;
    });
    rows.push(row);
  }

  return { rows, header };
}
