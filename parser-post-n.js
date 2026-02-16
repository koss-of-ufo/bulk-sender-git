// server.js (CommonJS, Node 18+)
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3003;

// =====================
// CORS
// - разрешаем http://192.168.11.90
// - разрешаем origin:null (если открыли html через file://)
// - разрешаем кастомный заголовок x-glpi-cookie
// =====================
const allowedOrigins = new Set([
  'http://192.168.11.90',
  'http://192.168.11.90:80',
  'http://localhost',
  'http://localhost:3000',
]);

app.use(cors({
  origin: (origin, cb) => {
    // origin может быть undefined/null (например file:// => "null" в консоли)
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false); // можно вернуть true если хочешь “разрешить всем”
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-glpi-cookie', 'x-glpi-app-token', 'x-glpi-user-token'],
  maxAge: 86400,
}));

app.options('*', cors());
app.use(express.json({ limit: '2mb' }));

// =====================
// DB pool
// =====================
const pool = new Pool({
  user: 'lvl3user',
  host: '10.2.201.114',
  database: 'lvl3db',
  password: 'ATomfrGqhhVvTqbLRy8ANuYoyLq5BU',
  port: 5000,
});

// =====================
// POST /query-violations
// =====================
app.post('/query-violations', async (req, res) => {
  const { numbers } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Не переданы номера для поиска.' });
  }

  // чуть чистим вход, чтобы не улетело лишнее
  const clean = numbers
    .map(n => String(n).replace(/\s+/g, '').trim())
    .filter(n => /^\d{20,}$/.test(n));

  if (!clean.length) {
    return res.status(400).json({ error: 'Номера некорректны (ожидаю >=20 цифр).' });
  }

  const placeholders = clean.map((_, i) => `$${i + 1}`).join(',');
  const queryText = `
    SELECT transaction_uuid, payment_dt, end_payment_date, v_regno
    FROM l3core_penalties.t_violations
    WHERE post_n IN (${placeholders})
  `;

  try {
    console.log('[query-violations] numbers:', clean.length);
    const result = await pool.query(queryText, clean);
    return res.json(result.rows);
  } catch (err) {
    console.error('[query-violations] error:', err);
    return res.status(500).json({ error: 'Ошибка на сервере при выполнении запроса к БД.' });
  }
});

// =====================
// POST /periods/open | /periods/close
// =====================
app.post('/periods/:action', async (req, res) => {
  const action = String(req.params.action || '').trim().toLowerCase();
  const queries = {
    open: 'update l3core_payments.e_fin_periods set "period_state"=2 where "period_state"=3;',
    close: 'update l3core_payments.e_fin_periods set "period_state"=3 where "period_state"=2;',
  };

  if (!queries[action]) {
    return res.status(400).json({ error: 'Некорректное действие. Используйте open или close.' });
  }

  try {
    console.log(`[periods] action=${action}`);
    const result = await pool.query(queries[action]);
    return res.json({ updated: result.rowCount || 0 });
  } catch (err) {
    console.error('[periods] error:', err);
    return res.status(500).json({ error: 'Ошибка на сервере при обновлении периодов.' });
  }
});

// =====================
// helper: fetch with timeout
// =====================
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// =====================
// GET /fetch-ticket?id=11353
// Ждём header: x-glpi-cookie: "glpi_xxx=...; glpi_xxx_rememberme=..."
// Возвращаем HTML вкладки Ticket$main, где уже можно искать textarea[name="content"]
// =====================
app.get('/fetch-ticket', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Bad ticket id' });
    }

    const glpiCookie = String(req.headers['x-glpi-cookie'] || '').trim();
    if (!glpiCookie) {
      return res.status(401).json({
        error: 'NO_COOKIE',
        message: 'Не передан x-glpi-cookie (нужны cookies сессии GLPI).',
      });
    }

    const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';
    const base = 'https://techsupport.megatoll.ru';
    const pageUrl = `${base}/front/ticket.form.php?id=${encodeURIComponent(id)}`;

    // ===== 1) прогрев/проверка авторизации (страница тикета) =====
    const r1 = await fetchWithTimeout(pageUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': userAgent,
        cookie: glpiCookie,
      },
      redirect: 'manual',
    });

    // 503/5xx
    if (r1.status === 503) {
      const body = await r1.text().catch(() => '');
      return res.status(502).json({
        error: 'GLPI_503',
        message: 'GLPI временно недоступен (503 от nginx).',
        snippet: body.slice(0, 300),
      });
    }
    if (r1.status >= 500) {
      const body = await r1.text().catch(() => '');
      return res.status(502).json({
        error: 'GLPI_5XX',
        message: `GLPI вернул ${r1.status}`,
        snippet: body.slice(0, 300),
      });
    }

    // редиректы (логин/петля)
    if ([301, 302, 303, 307, 308].includes(r1.status)) {
      const loc = r1.headers.get('location') || '';
      if (/login|front\/login\.php/i.test(loc)) {
        return res.status(401).json({
          error: 'GLPI_LOGIN_REDIRECT',
          message: 'Cookie невалидна/просрочена или нет прав. GLPI редиректит на login.',
          location: loc,
        });
      }
      return res.status(502).json({
        error: 'GLPI_REDIRECT',
        message: 'GLPI вернул редирект. Проверь base path (/glpi/?) или канонический URL.',
        status: r1.status,
        location: loc,
      });
    }

    const html1 = await r1.text();
    if (html1.includes("class='loginpage'") || html1.includes('GLPI - Аутентификация')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(401).send(html1);
    }

    // ===== 2) грузим вкладку Ticket$main =====
    const tabUrl =
      `${base}/ajax/common.tabs.php` +
      `?_target=/front/ticket.form.php&_itemtype=Ticket&_glpi_tab=Ticket$main&id=${encodeURIComponent(id)}&`;

    const r2 = await fetchWithTimeout(tabUrl, {
      method: 'POST',
      headers: {
        accept: 'text/html, */*; q=0.8',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': userAgent,
        cookie: glpiCookie,
        referer: pageUrl,
      },
      body: '',
      redirect: 'manual',
    });

    // 503/5xx
    if (r2.status === 503) {
      const body = await r2.text().catch(() => '');
      return res.status(502).json({
        error: 'GLPI_503',
        message: 'GLPI временно недоступен (503 от nginx) при загрузке вкладки.',
        snippet: body.slice(0, 300),
      });
    }
    if (r2.status >= 500) {
      const body = await r2.text().catch(() => '');
      return res.status(502).json({
        error: 'GLPI_5XX',
        message: `GLPI вернул ${r2.status} при загрузке вкладки`,
        snippet: body.slice(0, 300),
      });
    }

    // редиректы
    if ([301, 302, 303, 307, 308].includes(r2.status)) {
      const loc = r2.headers.get('location') || '';
      if (/login|front\/login\.php/i.test(loc)) {
        return res.status(401).json({
          error: 'GLPI_LOGIN_REDIRECT',
          message: 'Cookie невалидна/просрочена или нет прав (редирект на login) при загрузке вкладки.',
          location: loc,
        });
      }
      return res.status(502).json({
        error: 'GLPI_REDIRECT',
        message: 'Неожиданный редирект от GLPI при загрузке вкладки. Проверь base path (/glpi/?) или URL.',
        status: r2.status,
        location: loc,
      });
    }

    const tabHtml = await r2.text();
    if (tabHtml.includes("class='loginpage'") || tabHtml.includes('GLPI - Аутентификация')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(401).send(tabHtml);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(tabHtml);

  } catch (e) {
    const msg = String(e?.message || e);
    const isAbort = /aborted|AbortError/i.test(msg);
    console.error('[fetch-ticket] error:', e);
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? 'TIMEOUT' : 'FETCH_FAILED',
      message: msg,
    });
  }
});


app.listen(port, () => {
  console.log(`Back-end сервер запущен на http://localhost:${port}`);
  console.log('Это окно НЕЛЬЗЯ закрывать, пока вы работаете со страницей.');
});

// ===== GLPI REST helpers =====
const GLPI_BASE = 'https://techsupport.megatoll.ru'; // без /front
const GLPI_API = `${GLPI_BASE}/apirest.php`;

async function glpiFetch(path, { method = 'GET', headers = {}, body } = {}, ms = 15000) {
  const url = path.startsWith('http') ? path : `${GLPI_API}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    // GLPI API почти всегда json, но на ошибках может дать html (nginx/503)
    const ct = resp.headers.get('content-type') || '';
    let dataText = '';
    let dataJson = null;

    if (ct.includes('application/json')) {
      dataJson = await resp.json().catch(() => null);
    } else {
      dataText = await resp.text().catch(() => '');
    }

    return { resp, ct, json: dataJson, text: dataText };
  } finally {
    clearTimeout(t);
  }
}

async function glpiInitSession({ appToken, userToken }) {
  const { resp, json, text } = await glpiFetch('/initSession', {
    method: 'GET',
    headers: {
      'App-Token': appToken,
      'Authorization': `user_token ${userToken}`,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    // типовая диагностика
    const msg = json?.message || json?.error || text?.slice(0, 200) || `HTTP ${resp.status}`;
    const err = new Error(`initSession failed: ${msg}`);
    err.status = resp.status;
    err.payload = json || text;
    throw err;
  }

  const sessionToken = json?.session_token;
  if (!sessionToken) throw new Error('initSession: no session_token in response');
  return sessionToken;
}

async function glpiKillSession({ appToken, sessionToken }) {
  // необязательно, но красиво закрывать
  await glpiFetch('/killSession', {
    method: 'GET',
    headers: {
      'App-Token': appToken,
      'Session-Token': sessionToken,
      'Accept': 'application/json',
    },
  }).catch(() => { });
}

// ===== NEW: GET /glpi-ticket-text?id=123 =====
// headers required:
//   x-glpi-app-token: ...
//   x-glpi-user-token: ...
app.get('/glpi-ticket-text', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Bad ticket id' });

  const appToken = String(req.headers['x-glpi-app-token'] || '').trim();
  const userToken = String(req.headers['x-glpi-user-token'] || '').trim();
  if (!appToken || !userToken) {
    return res.status(401).json({
      error: 'NO_TOKENS',
      message: 'Не переданы токены. Нужны заголовки x-glpi-app-token и x-glpi-user-token.',
    });
  }

  let sessionToken = '';
  try {
    sessionToken = await glpiInitSession({ appToken, userToken });

    // 1) Берём тикет
    // Можно добавить ?expand_dropdowns=true, но нам обычно не надо
    const { resp, json, text } = await glpiFetch(`/Ticket/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'App-Token': appToken,
        'Session-Token': sessionToken,
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      const msg = json?.message || json?.error || text?.slice(0, 200) || `HTTP ${resp.status}`;
      return res.status(502).json({ error: 'GLPI_API_ERROR', message: msg, status: resp.status });
    }

    // В GLPI поле обычно: content (описание), name (заголовок)
    const content = (json?.content || '').toString().trim();
    const name = (json?.name || '').toString().trim();

    return res.json({
      id: Number(id),
      name,
      content,
      content_len: content.length,
    });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status === 401 ? 401 : 502).json({
      error: 'GLPI_API_FAILED',
      message: String(e?.message || e),
    });
  } finally {
    if (sessionToken) {
      await glpiKillSession({ appToken, sessionToken });
    }
  }
});

// =====================
// GET /fetch-ticket-api?id=123
// headers:
//   x-glpi-app-token: ...
//   x-glpi-user-token: ...
// Return: { content: "..." }
// =====================
app.get('/fetch-ticket-api', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Bad ticket id' });

  const appToken = String(req.headers['x-glpi-app-token'] || '').trim();
  const userToken = String(req.headers['x-glpi-user-token'] || '').trim();
  if (!appToken || !userToken) {
    return res.status(401).json({
      error: 'NO_TOKENS',
      message: 'Не передан x-glpi-app-token или x-glpi-user-token',
    });
  }

  // ⚠️ Проверь URL: если GLPI в /glpi, нужно ".../glpi/apirest.php"
  const GLPI_API_BASE = 'https://techsupport.megatoll.ru/apirest.php';

  async function glpiFetch(path, { method = 'GET', headers = {}, body } = {}) {
    const r = await fetchWithTimeout(`${GLPI_API_BASE}${path}`, {
      method,
      headers,
      body,
    }, 15000);

    const ct = r.headers.get('content-type') || '';
    const text = await r.text().catch(() => '');
    let json = null;
    if (ct.includes('application/json')) {
      try { json = JSON.parse(text); } catch { }
    }
    return { r, ct, text, json };
  }

  let sessionToken = null;

  try {
    // 1) initSession
    const init = await glpiFetch('/initSession', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'app-token': appToken,
        'authorization': `user_token ${userToken}`,
      },
      body: '{}',
    });

    if (!init.r.ok) {
      return res.status(502).json({
        error: 'GLPI_INIT_FAILED',
        message: `initSession вернул ${init.r.status}`,
        snippet: (init.json || init.text || '').toString().slice(0, 400),
      });
    }

    sessionToken = init.json?.session_token;
    if (!sessionToken) {
      return res.status(502).json({
        error: 'NO_SESSION_TOKEN',
        message: 'GLPI не вернул session_token',
        snippet: (init.text || '').slice(0, 400),
      });
    }

    const baseHeaders = {
      'app-token': appToken,
      'session-token': sessionToken,
    };

    // 2) Ticket/:id
    const t = await glpiFetch(`/Ticket/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: baseHeaders,
    });

    if (!t.r.ok) {
      return res.status(502).json({
        error: 'GLPI_TICKET_FAILED',
        message: `Ticket/${id} вернул ${t.r.status}`,
        snippet: (t.json || t.text || '').toString().slice(0, 400),
      });
    }

    // 3) TicketFollowup (часто именно тут текст обращения/комменты)
    const fu = await glpiFetch(`/Ticket/${encodeURIComponent(id)}/TicketFollowup`, {
      method: 'GET',
      headers: baseHeaders,
    });

    // Собираем content:
    // - если есть followup — берём самый первый/последний (на выбор)
    // - иначе пробуем поля из тикета
    let content = '';

    if (fu.r.ok && Array.isArray(fu.json) && fu.json.length) {
      // чаще полезнее самый первый (как "описание обращения")
      // если хочешь последний — замени [0] на [fu.json.length - 1]
      const first = fu.json[0];
      content =
        String(first?.content || first?.comment || first?.text || '').trim();
    }

    if (!content) {
      // fallback: некоторые инсталляции кладут в тикет поле content/description
      content = String(
        t.json?.content ||
        t.json?.description ||
        t.json?.comment ||
        ''
      ).trim();
    }

    return res.json({
      id: Number(id),
      content,
      ticket: t.json,         // можешь убрать, если не нужно
      followups: fu.json || [],// можешь убрать, если не нужно
    });

  } catch (e) {
    const msg = String(e?.message || e);
    const isAbort = /aborted|AbortError/i.test(msg);
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? 'TIMEOUT' : 'FETCH_FAILED',
      message: msg,
    });
  } finally {
    // 4) killSession
    if (sessionToken) {
      try {
        await glpiFetch('/killSession', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'app-token': appToken,
            'session-token': sessionToken,
          },
          body: '{}',
        });
      } catch { }
    }
  }
});
