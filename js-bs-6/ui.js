// js/ui.js
export function appendLog(dom, text, type = 'info') {
  const el = document.createElement('div');
  el.className = 'line ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : 'info');
  el.textContent = (new Date()).toLocaleTimeString() + ' → ' + text;
  dom.logBox.prepend(el);
}

export function setCounters(dom, state) {
  dom.totalEl.textContent = state.parsedRows.length;
  const succ = state.report.filter(r => r.ok).length;
  const fails = state.report.filter(r => !r.ok).length;
  dom.successEl.textContent = succ;
  dom.failEl.textContent = fails;
  dom.progressEl.textContent = `${state.report.length}/${state.parsedRows.length}`;
}

export function updateUrlByMode(dom) {
  if (dom.modeEl.value === 'pay_type') {
    dom.urlEl.value = 'http://10.2.201.200/api/ui/find-transactions/set_pay_type';
  } else {
    dom.urlEl.value = 'http://10.2.201.200/api/ui/find-transactions/set_grnz';
  }
}
