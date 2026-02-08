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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-glpi-cookie'],
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

    // 1) прогрев/проверка авторизации
    const r1 = await fetchWithTimeout(pageUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': userAgent,
        cookie: glpiCookie,
      },
      redirect: 'follow',
    });

    const html1 = await r1.text();
    if (html1.includes("class='loginpage'") || html1.includes('GLPI - Аутентификация')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(401).send(html1);
    }

    // 2) грузим вкладку "Ticket$main" (там обычно и есть нужный textarea)
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
      redirect: 'follow',
    });

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
