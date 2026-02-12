// js/parser/main.js
import { getDom } from './dom.js';
import { state } from './state.js';
import { extractNumbers, extractUUIDs, extractGRZ } from './extract.js';
import { render } from './render.js';
import { copyToClipboard, showCopied } from './clipboard.js';
import { bindEvents } from './events.js';
import { bindBridgeButtons } from './bridge.js';

(function init() {
  const dom = getDom();

  function updateResult() {
    if (!dom.input) return;
    const text = dom.input.value.trim();

    state.numbers = extractNumbers(text);
    state.uuids = extractUUIDs(text);
    state.grz = extractGRZ(text);

    render(dom, state);
  }

  const copyActions = {
    copyNumber() {
      if (state.numbers.length) copyToClipboard(state.numbers[0]).then(() => dom.output && showCopied(dom.output));
    },
    copySQL() {
      if (state.numbers.length) {
        const text = "in (" + state.numbers.map(n => `'${n}'`).join(',') + ")";
        copyToClipboard(text).then(() => dom.sqlOutput && showCopied(dom.sqlOutput));
      }
    },
    copyNumCsv() {
      if (state.numbers.length) copyToClipboard(state.numbers.join(', ')).then(() => dom.numCsvOutput && showCopied(dom.numCsvOutput));
    },

    copyUUIDMain() {
      if (state.uuids.length) copyToClipboard(state.uuids[0]).then(() => dom.uuidOutput && showCopied(dom.uuidOutput));
    },

    copyGrzMain() {
      if (state.grz.length) copyToClipboard(state.grz[0]).then(() => dom.grzOutput && showCopied(dom.grzOutput));
    },
    copyGrzSQL() {
      if (state.grz.length) {
        const text = "in (" + state.grz.map(g => `'${g}'`).join(',') + ")";
        copyToClipboard(text).then(() => dom.grzSqlOutput && showCopied(dom.grzSqlOutput));
      }
    },
    copyGrzCsv() {
      if (state.grz.length) copyToClipboard(state.grz.join(', ')).then(() => dom.grzCsvOutput && showCopied(dom.grzCsvOutput));
    },
  };

  // если у тебя HTML дергает window.copyNumber() и т.п. — оставим совместимость
  window.copyNumber = copyActions.copyNumber;
  window.copySQL = copyActions.copySQL;
  window.copyNumCsv = copyActions.copyNumCsv;
  window.copyUUIDMain = copyActions.copyUUIDMain;
  window.copyGrzMain = copyActions.copyGrzMain;
  window.copyGrzSQL = copyActions.copyGrzSQL;
  window.copyGrzCsv = copyActions.copyGrzCsv;

  bindEvents(dom, state, { updateResult, copyActions });
  bindBridgeButtons(dom);

  updateResult();
})();
