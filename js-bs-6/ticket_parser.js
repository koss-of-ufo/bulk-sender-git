(function () {
  const baseEl = document.getElementById('ticketBase');
  const idEl = document.getElementById('ticketId');
  const btn = document.getElementById('btnLoadTicket');
  const inputTextEl = document.getElementById('inputText');

  const statusEl = document.getElementById('status');
  const debugEl = document.getElementById('debug');

  // NEW: поле для cookie (добавь input в HTML: id="glpiCookie")
  const glpiCookieEl = document.getElementById('glpiCookie');

  const LS_KEY_COOKIE = 'glpi_cookie_header'; // per-browser (у каждого юзера будет своё)

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

  // load cookie from localStorage
  if (glpiCookieEl) {
    const saved = localStorage.getItem(LS_KEY_COOKIE);
    if (saved) glpiCookieEl.value = saved;

    glpiCookieEl.addEventListener('input', () => {
      localStorage.setItem(LS_KEY_COOKIE, glpiCookieEl.value.trim());
    });
  }

  async function loadTicket() {
    const id = String(idEl.value || '').trim();
    if (!/^\d+$/.test(id)) return setUiStatus('❌ Ticket ID должен быть числом', false);

    if (baseEl) baseEl.value = normalizeBase(baseEl.value);

    const glpiCookie = (glpiCookieEl?.value || '').trim();
    if (!glpiCookie) {
      return setUiStatus('❌ Вставь Cookie GLPI (x-glpi-cookie). Без этого тикет не откроется.', false);
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '⏳ Загружаю...';
    setUiStatus(`Загрузка тикета #${id}...`, true);

    try {
      const proxyUrl = `http://192.168.11.90:3003/fetch-ticket?id=${encodeURIComponent(id)}`;

      const resp = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'x-glpi-cookie': glpiCookie
        }
      });

      // 401 часто будет логин-страница
      if (resp.status === 401) {
        const html401 = await resp.text().catch(() => '');
        console.warn('[ticket_parser] 401 html snippet:', html401.slice(0, 600));
        return setUiStatus('❌ 401: нет доступа. Cookie неверная/просрочена или нет прав на тикет.', false);
      }

      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const ta = doc.querySelector('textarea[name="content"]');
      if (!ta) {
        setUiStatus('❌ Не нашёл textarea[name="content"] (возможно, вернулась не форма тикета)', false);
        console.warn('[ticket_parser] HTML snippet:', html.slice(0, 1200));
        return;
      }

      let content = (ta.textContent || ta.value || '').trim();
      content = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!content) {
        return setUiStatus('❌ textarea[name="content"] пустая', false);
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
