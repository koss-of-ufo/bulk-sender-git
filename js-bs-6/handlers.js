// js/handlers.js
import { uuidRegex, extractUUIDsFromString, copyToClipboard } from './utils.js';
import { parsePanText, parseCSVTextGeneric } from './parsers.js';
import { appendLog, setCounters } from './ui.js';
import { doFetch } from './api.js';
import { sleep, waitWhilePaused } from './utils.js';

export function buildPayloadForRow(dom, row) {
  const uuid = row.transaction_uuid;
  if (dom.modeEl.value === 'pay_type') {
    return { transaction_uuid: uuid, pay_type: Number(dom.payTypeEl.value) };
  } else if (dom.modeEl.value === 'class_change') {
    return { transaction_uuid: uuid, class: Number(dom.classEl.value) };
  } else if (dom.modeEl.value === 'pan_change') {
    const comment = dom.commentEl.value.trim()
      || String(document.getElementById('ticketId')?.value || '').trim();
    const payload = { transaction_uuid: uuid, grn: row.pan || '' };
    if (comment) payload.comment = comment;
    return payload;
  } else {
    const comment = dom.commentEl.value.trim()
      || String(document.getElementById('ticketId')?.value || '').trim();
    return { transaction_uuid: uuid, grn: dom.grnEl.value.trim(), comment };
  }
}

export async function parseSource(dom, state) {
  state.parsedRows = [];
  const src = dom.sourceEl.value;

  if (src === 'file') {
    const f = dom.csvFile.files[0];
    if (!f) { appendLog(dom, 'Нет выбранного файла', 'err'); return; }
    const text = await f.text();

    if (dom.modeEl.value === 'pan_change') {
      state.parsedRows = parsePanText(text);
    } else if (dom.fastExtractEl.checked) {
      const uuids = extractUUIDsFromString(text);
      state.parsedRows = Array.from(new Set(uuids)).map(uuid => ({ transaction_uuid: uuid }));
    } else {
      const parsed = parseCSVTextGeneric(text, dom.useFirstColIfHeaderEl.checked);
      state.parsedRows = parsed.rows;

      if (parsed.header && dom.uuidColEl.value.trim()) {
        const col = dom.uuidColEl.value.trim();
        state.parsedRows = state.parsedRows.map(r => ({ transaction_uuid: r[col] || r[Object.keys(r)[0]] || '' }));
      } else if (parsed.header && !dom.uuidColEl.value.trim()) {
        const colWithUuid = parsed.header.find(h => parsed.rows.some(r => uuidRegex.test(r[h])));
        if (colWithUuid) state.parsedRows = state.parsedRows.map(r => ({ transaction_uuid: r[colWithUuid] || '' }));
        else state.parsedRows = state.parsedRows.map(r => ({ transaction_uuid: r[Object.keys(r)[0]] || '' }));
      }
    }
  } else {
    const text = dom.textArea.value.trim();
    if (!text) { appendLog(dom, 'Textarea пуст', 'err'); return; }

    if (dom.modeEl.value === 'pan_change') {
      state.parsedRows = parsePanText(text);
    } else if (dom.fastExtractEl.checked) {
      const uuids = extractUUIDsFromString(text);
      state.parsedRows = Array.from(new Set(uuids)).map(uuid => ({ transaction_uuid: uuid }));
    } else {
      const parsed = parseCSVTextGeneric(text, dom.useFirstColIfHeaderEl.checked);
      state.parsedRows = parsed.rows;

      if (parsed.header && dom.uuidColEl.value.trim()) {
        const col = dom.uuidColEl.value.trim();
        state.parsedRows = state.parsedRows.map(r => ({ transaction_uuid: r[col] || r[Object.keys(r)[0]] || '' }));
      } else if (parsed.header) {
        const colWithUuid = parsed.header.find(h => parsed.rows.some(r => uuidRegex.test(r[h])));
        if (colWithUuid) state.parsedRows = parsed.rows.map(r => ({ transaction_uuid: r[colWithUuid] || '' }));
        else state.parsedRows = parsed.rows.map(r => ({ transaction_uuid: r[Object.keys(r)[0]] || '' }));
      }
    }
  }

  state.parsedRows = state.parsedRows.map(r => {
    const val = String(r.transaction_uuid || '').trim();
    const found = val.match(uuidRegex);
    if (found) return { transaction_uuid: found[0], pan: r.pan || '' };
    const tokens = val.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length === 1) return { transaction_uuid: tokens[0], pan: r.pan || '' };
    return { transaction_uuid: tokens[0] || val, pan: r.pan || '' };
  });

  state.parsedRows = state.parsedRows.filter(r => r.transaction_uuid && (dom.modeEl.value !== 'pan_change' || r.pan));

  appendLog(dom, `Парсинг завершён: ${state.parsedRows.length} UUID`, 'info');
  state.report = [];
  state.errors = [];
  setCounters(dom, state);
}

export function downloadErrors(dom, state) {
  if (!state.errors.length) { appendLog(dom, 'Нет ошибок для скачивания', 'info'); return; }
  const header = ['index', 'uuid', 'status', 'body'];
  const rowsCsv = [header.join(',')];

  state.errors.forEach(e => {
    const safe = v => `"${String(v || '').replace(/"/g, '""')}"`;
    rowsCsv.push([e.index, safe(e.uuid), safe(e.status), safe(e.body)].join(','));
  });

  const blob = new Blob([rowsCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'errors.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  appendLog(dom, 'errors.csv скачан', 'info');
}

export function downloadReport(dom, state) {
  if (!state.report.length) { appendLog(dom, 'Нет отчёта для скачивания', 'info'); return; }
  const header = ['index', 'uuid', 'ok', 'status', 'body'];
  const rowsCsv = [header.join(',')];

  state.report.forEach(r => {
    const safe = v => `"${String(v || '').replace(/"/g, '""')}"`;
    rowsCsv.push([r.index, safe(r.uuid), r.ok ? '1' : '0', safe(r.status), safe(r.body)].join(','));
  });

  const blob = new Blob([rowsCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  appendLog(dom, 'report.csv скачан', 'info');
}

export function initTokenPersistence(dom) {
  const LS_KEY = 'bulk_sender_api_token';
  if (!dom.authEl) return;

  const savedToken = localStorage.getItem(LS_KEY);
  if (savedToken) dom.authEl.value = savedToken;

  dom.authEl.addEventListener('input', () => {
    localStorage.setItem(LS_KEY, dom.authEl.value.trim());
  });

  dom.authEl.addEventListener('blur', () => {
    let v = dom.authEl.value.trim();
    if (v && !v.toLowerCase().startsWith('bearer ')) {
      v = 'Bearer ' + v;
      dom.authEl.value = v;
      localStorage.setItem(LS_KEY, v);
    }
  });
}

export function bindWindowEvents(dom, state) {
  window.addEventListener('parsed-uuids-ready', (event) => {
    const uuids = Array.isArray(event.detail?.uuids) ? event.detail.uuids : [];
    if (!uuids.length) {
      appendLog(dom, 'Из парсера не пришли UUID', 'err');
      return;
    }
    dom.sourceEl.value = 'textarea';
    dom.textArea.value = uuids.join('\n');
    appendLog(dom, `UUID из парсера подставлены в textarea: ${uuids.length}`, 'ok');
  });

  window.addEventListener('parsed-grn-mode-ready', (event) => {
    const uuid = String(event.detail?.uuid || '').trim();
    const grn = String(event.detail?.grn || '').trim();
    const uuids = Array.isArray(event.detail?.uuids) ? event.detail.uuids : [];

    if (!uuid || !grn) {
      appendLog(dom, 'Недостаточно данных из парсера для grn+comment', 'err');
      return;
    }

    dom.modeEl.value = 'grn_comment';
    dom.modeEl.dispatchEvent(new Event('change'));

    dom.sourceEl.value = 'textarea';
    dom.textArea.value = (uuids.length ? uuids : [uuid]).join('\n');
    dom.grnEl.value = grn;

    appendLog(dom, `Подставлены данные из парсера: mode=grn+comment, UUID=${uuid}, GRN=${grn}`, 'ok');
  });
}

export function bindUiHandlers(dom, state, { updateUrlByMode }) {
  const OPEN_PERIODS_SQL = 'update l3core_payments.e_fin_periods set "period_state"=2 where "period_state"=3;';
  const CLOSE_PERIODS_SQL = 'update l3core_payments.e_fin_periods set "period_state"=3 where "period_state"=2;';
  const PERIODS_API_URL = 'http://192.168.11.90:3003/periods';

  const updatePeriods = async (action, sql) => {
    try {
      const response = await fetch(`${PERIODS_API_URL}/${action}`, { method: 'POST' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Ошибка сети: ${response.status}`);
      }
      const data = await response.json().catch(() => ({}));
      const updated = typeof data.updated === 'number' ? data.updated : null;
      appendLog(
        dom,
        `Готово: ${action === 'open' ? 'открытие' : 'закрытие'} периодов` +
          (updated !== null ? `, обновлено строк: ${updated}` : ''),
        'ok'
      );
    } catch (error) {
      appendLog(dom, `Ошибка при ${action === 'open' ? 'открытии' : 'закрытии'} периодов: ${error.message}`, 'err');
      await copyToClipboard(sql);
      appendLog(dom, 'SQL скопирован в буфер обмена для ручного запуска', 'info');
    }
  };

  if (dom.btnTransferText) {
    dom.btnTransferText.addEventListener('click', () => {
      const text = dom.inputTextEl?.value.trim();
      if (!text) {
        appendLog(dom, 'Текст для парсинга пуст — нечего переносить', 'err');
        return;
      }
      dom.modeEl.value = 'pan_change';
      dom.modeEl.dispatchEvent(new Event('change'));
      dom.sourceEl.value = 'textarea';
      dom.textArea.value = text;
      appendLog(dom, 'Текст перенесён в Sender textarea', 'ok');
    });
  }

  if (dom.btnOpenPeriods) {
    dom.btnOpenPeriods.addEventListener('click', async () => {
      await updatePeriods('open', OPEN_PERIODS_SQL);
    });
  }

  if (dom.btnClosePeriods) {
    dom.btnClosePeriods.addEventListener('click', async () => {
      await updatePeriods('close', CLOSE_PERIODS_SQL);
    });
  }

  // Pause
  if (dom.btnPause) {
    dom.btnPause.addEventListener('click', () => {
      state.paused = !state.paused;
      dom.btnPause.textContent = state.paused ? 'Resume' : 'Pause';
      appendLog(dom, state.paused ? 'Пауза включена' : 'Пауза снята', 'info');
    });
  }

  // Preview
  dom.btnPreview.addEventListener('click', async () => {
    await parseSource(dom, state);
    if (!state.parsedRows.length) return alert('Нет UUID после парсинга');
    const n = Math.min(10, state.parsedRows.length);
    const list = [];
    for (let i = 0; i < n; i++) list.push(buildPayloadForRow(dom, state.parsedRows[i]));
    dom.previewBox.textContent = JSON.stringify(list, null, 2);
    appendLog(dom, `PREVIEW: показано ${n} записей`, 'info');
  });

  // Send 1
  dom.btnSendOne.addEventListener('click', async () => {
    await parseSource(dom, state);
    if (!state.parsedRows.length) return alert('Нет UUID для отправки');
    const payload = buildPayloadForRow(dom, state.parsedRows[0]);
    appendLog(dom, `Отправляю тестовую: ${JSON.stringify(payload)}`, 'info');

    state.abortController = new AbortController();
    try {
      const res = await doFetch(dom, state, payload);
      state.report.push({ index: 1, uuid: payload.transaction_uuid, ok: res.ok, status: res.status, body: res.body });

      if (res.ok) {
        appendLog(dom, `OK ${res.status} ${payload.transaction_uuid} → ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`, 'ok');
      } else {
        appendLog(dom, `ERR ${res.status} ${payload.transaction_uuid} → ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`, 'err');
        state.errors.push({ index: 1, uuid: payload.transaction_uuid, status: res.status, body: typeof res.body === 'object' ? JSON.stringify(res.body) : res.body });
      }

      setCounters(dom, state);
    } catch (e) {
      if (e.name === 'AbortError') appendLog(dom, 'Тестовая отправка отменена', 'err');
      else appendLog(dom, 'Ошибка тестовой отправки: ' + e, 'err');
    } finally {
      state.abortController = null;
    }
  });

  // Stop
  dom.btnStop.addEventListener('click', () => {
    state.running = false;
    if (state.abortController) state.abortController.abort();
    state.abortController = null;

    appendLog(dom, 'Процесс остановлен пользователем', 'err');

    dom.btnStop.disabled = true;

    state.paused = false;
    dom.btnPause.disabled = true;
    dom.btnPause.textContent = 'Pause';
  });

  // Send All
  dom.btnSendAll.addEventListener('click', async () => {
    await parseSource(dom, state);
    if (!state.parsedRows.length) return alert('Нет UUID для отправки');
    if (state.running) return alert('Уже выполняется отправка');

    if (!dom.skipPreviewEl.checked) {
      const proceed = confirm('Сделать Preview (первые 10)? Нажмите Отмена чтобы продолжить без Preview.');
      if (proceed) {
        const list = state.parsedRows.slice(0, Math.min(10, state.parsedRows.length))
          .map(r => buildPayloadForRow(dom, r));
        dom.previewBox.textContent = JSON.stringify(list, null, 2);
        const ok = confirm('Просмотрен PREVIEW. Нажмите ОК для продолжения массовой отправки.');
        if (!ok) { appendLog(dom, 'Массовая отправка отменена после Preview', 'err'); return; }
      }
    }

    state.running = true;
    state.abortController = new AbortController();

    dom.btnPause.disabled = false;
    dom.btnPause.textContent = 'Pause';
    state.paused = false;

    dom.btnStop.disabled = false;

    state.errors = [];
    state.report = [];
    let completedAll = true;

    appendLog(dom, `Начинаю массовую отправку ${state.parsedRows.length} записей, delay=${dom.delayEl.value} ms`, 'info');
    const delayMs = Math.max(0, Number(dom.delayEl.value) || 200);

    for (let i = 0; i < state.parsedRows.length; i++) {
      if (!state.running) {
        completedAll = false;
        break;
      }

      await waitWhilePaused(state);
      if (!state.running) {
        completedAll = false;
        break;
      }

      const payload = buildPayloadForRow(dom, state.parsedRows[i]);
      appendLog(dom, `#${i + 1} ${payload.transaction_uuid} → ${JSON.stringify(payload)}`, 'info');

      try {
        let res = await doFetch(dom, state, payload);

        if (res.status === 429) {
          appendLog(dom, `429 Too Many Requests. Автопауза на 90с...`, 'err');

          for (let t = 0; t < 90; t++) {
            if (!state.running) {
              completedAll = false;
              break;
            }
            await waitWhilePaused(state);
            await sleep(1000);
          }
          if (!state.running) {
            completedAll = false;
            break;
          }

          appendLog(dom, `Повтор запроса после автопаузы: ${payload.transaction_uuid}`, 'info');
          res = await doFetch(dom, state, payload);
        }

        state.report.push({
          index: i + 1,
          uuid: payload.transaction_uuid,
          ok: res.ok,
          status: res.status,
          body: typeof res.body === 'object' ? JSON.stringify(res.body) : res.body
        });

        if (res.ok) {
          appendLog(dom, `OK ${res.status} ${payload.transaction_uuid}`, 'ok');
        } else {
          appendLog(dom, `ERR ${res.status} ${payload.transaction_uuid} → ${typeof res.body === 'object' ? JSON.stringify(res.body) : res.body}`, 'err');
          state.errors.push({
            index: i + 1,
            uuid: payload.transaction_uuid,
            status: res.status,
            body: typeof res.body === 'object' ? JSON.stringify(res.body) : res.body
          });
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          appendLog(dom, `Отмена (Abort) на ${payload.transaction_uuid}`, 'err');
          state.report.push({ index: i + 1, uuid: payload.transaction_uuid, ok: false, status: 'aborted', body: 'aborted' });
          state.errors.push({ index: i + 1, uuid: payload.transaction_uuid, status: 'aborted', body: 'aborted' });
          completedAll = false;
          break;
        } else {
          appendLog(dom, `NETWORK ERROR ${payload.transaction_uuid} → ${e}`, 'err');
          state.report.push({ index: i + 1, uuid: payload.transaction_uuid, ok: false, status: 'network', body: String(e) });
          state.errors.push({ index: i + 1, uuid: payload.transaction_uuid, status: 'network', body: String(e) });
        }
      }

      setCounters(dom, state);

      if (i < state.parsedRows.length - 1) {
        let left = delayMs;
        while (left > 0 && state.running) {
          await waitWhilePaused(state);
          const step = Math.min(200, left);
          await sleep(step);
          left -= step;
        }
      }
    }

    state.running = false;
    state.abortController = null;

    dom.btnStop.disabled = true;
    dom.btnPause.disabled = true;
    dom.btnPause.textContent = 'Pause';
    state.paused = false;

    appendLog(dom, `Массовая отправка завершена. Ошибок: ${state.errors.length}`, 'info');

    if (dom.autoDownloadErrorsEl.checked && state.errors.length) {
      downloadErrors(dom, state);
    }

    if (dom.autoClosePeriodsEl?.checked && completedAll && state.errors.length === 0) {
      await updatePeriods('close', CLOSE_PERIODS_SQL);
    }
  });

  // Download buttons
  dom.btnDownloadErrors.addEventListener('click', () => downloadErrors(dom, state));
  dom.btnDownloadReport.addEventListener('click', () => downloadReport(dom, state));

  // Parse file on change
  dom.csvFile.addEventListener('change', async () => {
    const f = dom.csvFile.files[0];
    if (!f) return;
    const text = await f.text();

    let count = 0;
    if (dom.modeEl.value === 'pan_change') count = parsePanText(text).length;
    else if (dom.fastExtractEl.checked) count = extractUUIDsFromString(text).length;
    else {
      const parsed = parseCSVTextGeneric(text, dom.useFirstColIfHeaderEl.checked);
      if (parsed.rows) count = parsed.rows.length;
    }

    appendLog(dom, `Файл выбран. Примерно строк: ${count}`, 'info');
    state.parsedRows = [];
    state.report = [];
    state.errors = [];
    setCounters(dom, state);
  });

  // Mode -> URL
  const syncMode = (value) => {
    if (dom.modeEl && dom.modeEl.value !== value) dom.modeEl.value = value;
    if (dom.modeSidebarEl && dom.modeSidebarEl.value !== value) dom.modeSidebarEl.value = value;
    updateUrlByMode(dom);
  };

  dom.modeEl.addEventListener('change', () => syncMode(dom.modeEl.value));
  if (dom.modeSidebarEl) {
    dom.modeSidebarEl.addEventListener('change', () => syncMode(dom.modeSidebarEl.value));
  }
}
