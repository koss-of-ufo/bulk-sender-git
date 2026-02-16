(function () {
  const baseEl = document.getElementById('ticketBase');
  const idEl = document.getElementById('ticketId');
  const btn = document.getElementById('btnLoadTicket');
  const inputTextEl = document.getElementById('inputText');

  const statusEl = document.getElementById('status');
  const debugEl = document.getElementById('debug');

  const glpiAppTokenEl = document.getElementById('glpiAppToken');
  const glpiUserTokenEl = document.getElementById('glpiUserToken');

  const LS_APP = 'glpi_app_token';
  const LS_USER = 'glpi_user_token';

  if (!btn || !idEl || !inputTextEl) {
    console.error('[ticket_parser] required DOM nodes not found');
    return;
  }

  function setUiStatus(msg, ok = true) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.className = 'status ' + (ok ? 'success' : 'error');
    }
    if (debugEl) debugEl.textContent = msg;
  }

  function normalizeBase(base) {
    let b = String(base || '').trim();
    if (!b) return '';
    const m = b.match(/^(.*ticket\.form\.php\?id=)/i);
    return m ? m[1] : b;
  }

  // load tokens from localStorage
  if (glpiAppTokenEl) {
    const saved = localStorage.getItem(LS_APP);
    if (saved) glpiAppTokenEl.value = saved;
    glpiAppTokenEl.addEventListener('input', () => {
      localStorage.setItem(LS_APP, glpiAppTokenEl.value.trim());
    });
  }

  if (glpiUserTokenEl) {
    const saved = localStorage.getItem(LS_USER);
    if (saved) glpiUserTokenEl.value = saved;
    glpiUserTokenEl.addEventListener('input', () => {
      localStorage.setItem(LS_USER, glpiUserTokenEl.value.trim());
    });
  }

  async function loadTicket() {
    const id = String(idEl.value || '').trim();
    if (!/^\d+$/.test(id)) return setUiStatus('❌ Ticket ID должен быть числом', false);

    const appToken = (glpiAppTokenEl?.value || '').trim();
    const userToken = (glpiUserTokenEl?.value || '').trim();
    if (!appToken || !userToken) {
      return setUiStatus('❌ Вставь GLPI App Token и User Token.', false);
    }

    if (baseEl) baseEl.value = normalizeBase(baseEl.value);

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '⏳ Загружаю...';
    setUiStatus(`Загрузка тикета #${id}...`, true);

    try {
      const proxyUrl = `http://192.168.11.90:3003/fetch-ticket-api?id=${encodeURIComponent(id)}`;

      const resp = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'x-glpi-app-token': appToken,
          'x-glpi-user-token': userToken,
        }
      });

      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';

        if (ct.includes('application/json')) {
          const j = await resp.json().catch(() => ({}));
          return setUiStatus(`❌ ${j.message || j.error || `HTTP ${resp.status}`}`, false);
        }

        const t = await resp.text().catch(() => '');
        const snippet = t.slice(0, 400).replace(/\s+/g, ' ').trim();
        return setUiStatus(`❌ HTTP ${resp.status}: ${snippet || resp.statusText}`, false);
      }

      const data = await resp.json().catch(() => ({}));
      const content = String(data.content || '').trim();

      if (!content) {
        return setUiStatus('❌ В тикете пустой content (или не удалось получить).', false);
      }

      inputTextEl.value = content;
      inputTextEl.dispatchEvent(new Event('input', { bubbles: true }));
      setUiStatus(`✅ Текст тикета загружен: ${content.length} символов`, true);

    } catch (e) {
      const msg = String(e?.message || e);
      setUiStatus(`❌ Ошибка загрузки тикета: ${msg}`, false);
      console.error('[ticket_parser] loadTicket error:', e);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText || '📥 Загрузить текст тикета';
    }
  }

  btn.addEventListener('click', loadTicket);
})();
