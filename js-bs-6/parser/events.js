// js/parser/events.js
import { queryDatabase } from './db.js';

export function bindEvents(dom, state, { updateResult, copyActions }) {
  dom.input?.addEventListener('paste', updateResult);
  dom.input?.addEventListener('input', updateResult);

  dom.input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state.numbers.length) copyActions.copyNumber();
      else if (state.uuids.length) copyActions.copyUUIDMain();
      else if (state.grz.length) copyActions.copyGrzMain();
    }
  });

  dom.queryDbBtn?.addEventListener('click', () => queryDatabase(dom, state.numbers));
}
