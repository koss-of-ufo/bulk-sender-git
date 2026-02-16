// js/api.js
export async function doFetch(dom, state, payload) {
  const endpoint = dom.urlEl.value.trim();
  const method = dom.methodEl.value || 'POST';
  const headers = { 'Content-Type': 'application/json;charset=UTF-8' };
  const token = dom.authEl.value.trim();
  if (token) headers['Authorization'] = token;

  try {
    const resp = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(payload),
      signal: state.abortController ? state.abortController.signal : undefined,
      credentials: 'include'
    });

    let body;
    try { body = await resp.clone().json(); } catch (e) { body = await resp.text(); }
    return { ok: resp.ok, status: resp.status, body };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ok: false, status: 'network', body: String(err) };
  }
}
