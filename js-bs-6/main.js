// js/main.js
import { getDom } from './dom.js';
import { state } from './state.js';
import { appendLog, updateUrlByMode, setCounters } from './ui.js';
import { bindUiHandlers, bindWindowEvents, initTokenPersistence } from './handlers.js';

(function init() {
  const dom = getDom();

  // mode->url init
  updateUrlByMode(dom);

  // bind ui
  bindUiHandlers(dom, state, { updateUrlByMode });
  bindWindowEvents(dom, state);

  // token persistence
  initTokenPersistence(dom);

  // initial counters
  setCounters(dom, state);

  appendLog(dom, 'Инструмент готов. Выберите источник UUID (файл или поле), нажмите Preview, затем Send 1 и потом Send All.', 'info');
})();
