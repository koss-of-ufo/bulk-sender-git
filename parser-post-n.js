// server.js (CommonJS, Node 18+)
// ✅ 2 режима: COOKIE (HTML) + TOKEN (GLPI REST apirest.php)
// ✅ /fetch-ticket      -> COOKIE HTML (Ticket$main)
// ✅ /fetch-ticket-api  -> универсальный: token (приоритет) -> fallback cookie (если есть)
// ✅ /glpi-ticket-text  -> alias на /fetch-ticket-api

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3003;

// =====================
// CORS
// =====================
const allowedOrigins = new Set([
  'http://192.168.11.90',
  'http://192.168.11.90:80',
  'http://localhost',
  'http://localhost:3000',
]);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // file://
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-glpi-cookie',
    'x-glpi-app-token',
    'x-glpi-user-token',
  ],
  maxAge: 86400,
}));

app.options('*', cors());
app.use(express.json({ limit: '2mb' }));

// =====================
// DB pool
// =====================
// ⚠️ лучше вынести пароль в ENV (process.env.DB_PASSWORD)
const pool = new Pool({
  user: 'lvl3user',
  host: '10.2.201.114',
  database: 'lvl3db',
  password: 'ATomfrGqhhVvTqbLRy8ANuYoyLq5BU',
  port: 5000,
});

// =====================
// helpers (общие)
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

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractContentFromTicketTabHtml(html) {
  const src = String(html || '');
  const m = src.match(/<textarea[^>]*name=["']content["'][^>]*>([\s\S]*?)<\/textarea>/i);
  if (!m) return '';
  return decodeHtmlEntities(m[1]).trim();
}

function isAbortError(e) {
  const msg = String(e?.message || e);
  return /aborted|AbortError/i.test(msg);
}

// =====================
// DB endpoints (как было)
// =====================
app.post('/query-violations', async (req, res) => {
  const { numbers } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Не переданы номера для поиска.' });
  }

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
    const result = await pool.query(queryText, clean);
    return res.json(result.rows);
  } catch (err) {
    console.error('[query-violations] error:', err);
    return res.status(500).json({ error: 'Ошибка на сервере при выполнении запроса к БД.' });
  }
});

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
    const result = await pool.query(queries[action]);
    return res.json({ updated: result.rowCount || 0 });
  } catch (err) {
    console.error('[periods] error:', err);
    return res.status(500).json({ error: 'Ошибка на сервере при обновлении периодов.' });
  }
});

// ======================================================================
// COOKIE MODE (HTML): получить HTML вкладки Ticket$main
// GET /fetch-ticket?id=123  (header: x-glpi-cookie)
// ======================================================================
const GLPI_WEB_BASE = 'https://techsupport.megatoll.ru';

async function fetchTicketTabHtmlByCookie({ id, glpiCookie, userAgent }) {
  const pageUrl = `${GLPI_WEB_BASE}/front/ticket.form.php?id=${encodeURIComponent(id)}`;

  // 1) прогрев
  const r1 = await fetchWithTimeout(pageUrl, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': userAgent,
      cookie: glpiCookie,
    },
    redirect: 'manual',
  });

  // nginx/503/5xx
  if (r1.status === 503) {
    const body = await r1.text().catch(() => '');
    const err = new Error('GLPI web 503');
    err.code = 'GLPI_503';
    err.status = 503;
    err.snippet = body.slice(0, 400);
    throw err;
  }
  if (r1.status >= 500) {
    const body = await r1.text().catch(() => '');
    const err = new Error(`GLPI web ${r1.status}`);
    err.code = 'GLPI_5XX';
    err.status = r1.status;
    err.snippet = body.slice(0, 400);
    throw err;
  }

  // редирект на логин?
  if ([301, 302, 303, 307, 308].includes(r1.status)) {
    const loc = r1.headers.get('location') || '';
    const err = new Error('GLPI redirect');
    err.code = /login|front\/login\.php/i.test(loc) ? 'GLPI_LOGIN_REDIRECT' : 'GLPI_REDIRECT';
    err.status = r1.status;
    err.location = loc;
    throw err;
  }

  const html1 = await r1.text().catch(() => '');
  if (html1.includes("class='loginpage'") || html1.includes('GLPI - Аутентификация')) {
    const err = new Error('Not authorized (login page)');
    err.code = 'NO_AUTH';
    err.status = 401;
    throw err;
  }

  // 2) вкладка Ticket$main
  const tabUrl =
    `${GLPI_WEB_BASE}/ajax/common.tabs.php` +
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

  if (r2.status === 503) {
    const body = await r2.text().catch(() => '');
    const err = new Error('GLPI tab 503');
    err.code = 'GLPI_503';
    err.status = 503;
    err.snippet = body.slice(0, 400);
    throw err;
  }
  if (r2.status >= 500) {
    const body = await r2.text().catch(() => '');
    const err = new Error(`GLPI tab ${r2.status}`);
    err.code = 'GLPI_5XX';
    err.status = r2.status;
    err.snippet = body.slice(0, 400);
    throw err;
  }

  if ([301, 302, 303, 307, 308].includes(r2.status)) {
    const loc = r2.headers.get('location') || '';
    const err = new Error('GLPI redirect (tab)');
    err.code = /login|front\/login\.php/i.test(loc) ? 'GLPI_LOGIN_REDIRECT' : 'GLPI_REDIRECT';
    err.status = r2.status;
    err.location = loc;
    throw err;
  }

  const tabHtml = await r2.text().catch(() => '');
  if (tabHtml.includes("class='loginpage'") || tabHtml.includes('GLPI - Аутентификация')) {
    const err = new Error('Not authorized (login page tab)');
    err.code = 'NO_AUTH';
    err.status = 401;
    throw err;
  }

  return tabHtml;
}

app.get('/fetch-ticket', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Bad ticket id' });

    const glpiCookie = String(req.headers['x-glpi-cookie'] || '').trim();
    if (!glpiCookie) {
      return res.status(401).json({ error: 'NO_COOKIE', message: 'Не передан x-glpi-cookie.' });
    }

    const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';
    const tabHtml = await fetchTicketTabHtmlByCookie({ id, glpiCookie, userAgent });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(tabHtml);
  } catch (e) {
    const code = e.code || 'FETCH_FAILED';
    const status = e.status || (isAbortError(e) ? 504 : 502);
    return res.status(status).json({
      error: code,
      message: String(e?.message || e),
      location: e.location,
      snippet: e.snippet,
    });
  }
});

// ======================================================================
// TOKEN MODE (GLPI REST): как в твоём curl
// initSession: GET /apirest.php/initSession
// ticket:      GET /apirest.php/Ticket/:id
// followups:   GET /apirest.php/Ticket/:id/TicketFollowup
// ======================================================================
const GLPI_REST = 'https://techsupport.megatoll.ru/apirest.php';

async function glpiRest(path, { method = 'GET', headers = {} } = {}, ms = 15000) {
  const url = path.startsWith('http') ? path : `${GLPI_REST}${path}`;
  const resp = await fetchWithTimeout(url, { method, headers }, ms);

  const ct = resp.headers.get('content-type') || '';
  let json = null;
  let text = '';

  if (ct.includes('application/json')) {
    json = await resp.json().catch(() => null);
  } else {
    text = await resp.text().catch(() => '');
  }

  return { resp, ct, json, text };
}

async function glpiInitSession({ appToken, userToken }) {
  const { resp, json, text } = await glpiRest('/initSession', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${userToken}`,
      'App-Token': appToken,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    const msg = json?.message || json?.error || text?.slice(0, 400) || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    // чтобы красиво отличать 503:
    err.code = resp.status === 503 ? 'GLPI_503' : 'GLPI_INIT_FAILED';
    err.snippet = text?.slice(0, 400);
    throw err;
  }

  const sessionToken = json?.session_token;
  if (!sessionToken) {
    const err = new Error('initSession: no session_token in response');
    err.status = 502;
    err.code = 'NO_SESSION_TOKEN';
    throw err;
  }

  return sessionToken;
}

async function glpiKillSession({ appToken, sessionToken }) {
  await glpiRest('/killSession', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Session-Token': sessionToken,
      'App-Token': appToken,
      'Accept': 'application/json',
    },
  }).catch(() => {});
}

async function fetchTicketTextByToken({ id, appToken, userToken }) {
  const sessionToken = await glpiInitSession({ appToken, userToken });

  try {
    // 1) Ticket/:id
    const t = await glpiRest(`/Ticket/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': appToken,
        'Accept': 'application/json',
      },
    });

    if (!t.resp.ok) {
      const msg = t.json?.message || t.json?.error || t.text?.slice(0, 400) || `HTTP ${t.resp.status}`;
      const err = new Error(msg);
      err.status = t.resp.status;
      err.code = t.resp.status === 503 ? 'GLPI_503' : 'GLPI_TICKET_FAILED';
      err.snippet = t.text?.slice(0, 400);
      throw err;
    }

    // 2) Followups (часто именно тут "текст обращения" как textarea)
    const fu = await glpiRest(`/Ticket/${encodeURIComponent(id)}/TicketFollowup`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': appToken,
        'Accept': 'application/json',
      },
    });

    let content = '';

    if (fu.resp.ok && Array.isArray(fu.json) && fu.json.length) {
      // аналог textarea: первый followup (как "описание обращения")
      content = String(fu.json[0]?.content || '').trim();
    }

    if (!content) {
      // fallback на Ticket.content
      content = String(t.json?.content || t.json?.description || '').trim();
    }

    return {
      id: Number(id),
      mode: 'token',
      name: String(t.json?.name || '').trim(),
      content,
      content_len: content.length,
    };
  } finally {
    await glpiKillSession({ appToken, sessionToken });
  }
}

// ======================================================================
// UNIVERSAL: GET /fetch-ticket-api?id=123
// 1) Если есть токены -> пробуем TOKEN MODE
//    - если TOKEN MODE упал на 503/5xx и есть cookie -> fallback COOKIE MODE
// 2) Если токенов нет, но есть cookie -> COOKIE MODE
// ======================================================================
app.get('/fetch-ticket-api', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Bad ticket id' });

  const appToken = String(req.headers['x-glpi-app-token'] || '').trim();
  const userToken = String(req.headers['x-glpi-user-token'] || '').trim();
  const glpiCookie = String(req.headers['x-glpi-cookie'] || '').trim();

  const hasTokenAuth = Boolean(appToken && userToken);
  const hasCookieAuth = Boolean(glpiCookie);

  if (!hasTokenAuth && !hasCookieAuth) {
    return res.status(401).json({
      error: 'NO_AUTH',
      message: 'Передайте x-glpi-app-token + x-glpi-user-token или x-glpi-cookie.',
    });
  }

  const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

  // 1) TOKEN MODE (приоритет)
  if (hasTokenAuth) {
    try {
      const result = await fetchTicketTextByToken({ id, appToken, userToken });
      return res.json(result);
    } catch (e) {
      // если есть cookie — пробуем fallback только на "сетевые/серверные" ошибки
      const status = e?.status || 502;
      const code = e?.code || 'GLPI_TOKEN_MODE_FAILED';

      const canFallback =
        hasCookieAuth && (
          status === 503 ||
          status >= 500 ||
          code === 'GLPI_503' ||
          code === 'GLPI_INIT_FAILED' ||
          code === 'GLPI_TICKET_FAILED'
        );

      if (!canFallback) {
        return res.status(status === 401 ? 401 : 502).json({
          error: code,
          message: String(e?.message || e),
          snippet: e?.snippet,
        });
      }

      // FALLBACK COOKIE MODE
      try {
        const tabHtml = await fetchTicketTabHtmlByCookie({ id, glpiCookie, userAgent });
        const content = extractContentFromTicketTabHtml(tabHtml);

        return res.json({
          id: Number(id),
          mode: 'cookie_fallback',
          content,
          content_len: content.length,
          token_error: { error: code, status, message: String(e?.message || e) },
        });
      } catch (e2) {
        const status2 = e2?.status || 502;
        return res.status(502).json({
          error: 'BOTH_MODES_FAILED',
          message: 'Не удалось получить тикет ни через token, ни через cookie.',
          token_error: { error: code, status, message: String(e?.message || e), snippet: e?.snippet },
          cookie_error: { error: e2?.code || 'COOKIE_MODE_FAILED', status: status2, message: String(e2?.message || e2), snippet: e2?.snippet },
        });
      }
    }
  }

  // 2) COOKIE ONLY
  try {
    const tabHtml = await fetchTicketTabHtmlByCookie({ id, glpiCookie, userAgent });
    const content = extractContentFromTicketTabHtml(tabHtml);

    return res.json({
      id: Number(id),
      mode: 'cookie',
      content,
      content_len: content.length,
    });
  } catch (e) {
    const status = e?.status || 502;
    return res.status(status === 401 ? 401 : 502).json({
      error: e?.code || 'COOKIE_MODE_FAILED',
      message: String(e?.message || e),
      snippet: e?.snippet,
      location: e?.location,
    });
  }
});

// alias
app.get('/glpi-ticket-text', (req, res) => {
  // просто вызываем тот же handler (без трюков с app._router)
  return app._router.handle(
    Object.assign(req, { url: `/fetch-ticket-api${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}` }),
    res,
    () => {}
  );
});

// =====================
// START
// =====================
app.listen(port, () => {
  console.log(`Back-end сервер запущен на http://localhost:${port}`);
  console.log('Это окно НЕЛЬЗЯ закрывать, пока вы работаете со страницей.');
});
