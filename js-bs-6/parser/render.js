// js/parser/render.js
export function displayDbResults(dom, data) {
  if (!Array.isArray(data) || data.length === 0) {
    dom.dbResultsOutput.innerHTML = '<p>По указанным номерам в базе данных ничего не найдено.</p>';
    return;
  }

  const normalizeGrz = value => String(value || '').replace(/\s+/g, '').toUpperCase();
  const grzFromParser = normalizeGrz(dom.grzOutput?.textContent);

  let table = '<table class="db-results-table"><thead><tr>';
  const headers = Object.keys(data[0] || {});
  headers.forEach(h => table += `<th>${h}</th>`);
  table += '</tr></thead><tbody>';

  const formatValue = value => {
    if (value === null || value === undefined) return 'NULL';
  
    // если это ISO-дата или Date
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('ru-RU'); // локальное время
    }
  
    return value;
  };  

  data.forEach(row => {
    table += '<tr>';
    headers.forEach(h => {
      table += `<td>${formatValue(row[h])}</td>`;
    });
    table += '</tr>';
  });

  table += '</tbody></table>';
  const vRegnos = data
    .map(row => row?.v_regno)
    .filter(val => val !== null && val !== undefined && String(val).trim() !== '');
  const normalizedRegnos = vRegnos.map(normalizeGrz);
  const uniqueRegnos = Array.from(new Set(normalizedRegnos));

  let comparisonMarkup = '';
  if (grzFromParser && uniqueRegnos.length > 0) {
    const isMatch = uniqueRegnos.includes(grzFromParser);
    const humanRegnos = Array.from(new Set(vRegnos.map(val => String(val))));
    comparisonMarkup = `
      <div class="status ${isMatch ? 'success' : 'error'}" style="margin-top:8px;">
        ${isMatch ? '✅' : '❌'} Сравнение ГРНЗ: из БД ${isMatch ? 'совпадает' : 'не совпадает'}
        (v_regno: ${humanRegnos.join(', ')}; из обращения: ${dom.grzOutput?.textContent || '—'})
      </div>
    `;
  } else if (!grzFromParser && uniqueRegnos.length > 0) {
    comparisonMarkup = `
      <div class="status" style="margin-top:8px; background: rgba(14, 165, 233, 0.08); color: #0ea5e9;">
        ℹ️ В БД есть v_regno (${uniqueRegnos.join(', ')}), но ГРНЗ в тексте обращения не найден.
      </div>
    `;
  }

  dom.dbResultsOutput.innerHTML = `${table}${comparisonMarkup}`;
}

export function render(dom, state) {
  if (!dom.input) return;

  const hasNumbers = state.numbers.length > 0;
  const hasUUIDs = state.uuids.length > 0;
  const hasGRZ = state.grz.length > 0;

  if (hasNumbers || hasUUIDs || hasGRZ) {
    dom.result && (dom.result.style.display = 'block');
    dom.status && (dom.status.className = 'status success');

    const parts = [];

    // Numbers
    if (dom.cardNumMain) dom.cardNumMain.style.display = hasNumbers ? 'block' : 'none';
    if (dom.cardNumSql) dom.cardNumSql.style.display = hasNumbers ? 'block' : 'none';
    if (dom.cardNumCsv) dom.cardNumCsv.style.display = hasNumbers ? 'block' : 'none';

    if (hasNumbers) {
      dom.output && (dom.output.textContent = state.numbers[0]);
      dom.sqlOutput && (dom.sqlOutput.textContent = `in ('${state.numbers.join("','")}')`);
      dom.numCsvOutput && (dom.numCsvOutput.textContent = state.numbers.join(', '));
      dom.mainCount && (dom.mainCount.textContent = `1/${state.numbers.length}`);
      dom.sqlCount && (dom.sqlCount.textContent = `${state.numbers.length}`);
      dom.numCsvCount && (dom.numCsvCount.textContent = `${state.numbers.length}`);
      parts.push(`${state.numbers.length} постановл.`);
    }

    // UUIDs
    if (dom.cardUuidMain) dom.cardUuidMain.style.display = hasUUIDs ? 'block' : 'none';

    if (hasUUIDs) {
      dom.uuidOutput && (dom.uuidOutput.textContent = state.uuids[0]);
      dom.uuidMainCount && (dom.uuidMainCount.textContent = `1/${state.uuids.length}`);
      parts.push(`${state.uuids.length} UUID`);
    }

    // GRZ
    if (dom.cardGrzMain) dom.cardGrzMain.style.display = hasGRZ ? 'block' : 'none';
    if (dom.cardGrzSql) dom.cardGrzSql.style.display = hasGRZ ? 'block' : 'none';
    if (dom.cardGrzCsv) dom.cardGrzCsv.style.display = hasGRZ ? 'block' : 'none';

    if (hasGRZ) {
      dom.grzOutput && (dom.grzOutput.textContent = state.grz[0]);
      dom.grzSqlOutput && (dom.grzSqlOutput.textContent = `in ('${state.grz.join("','")}')`);
      dom.grzCsvOutput && (dom.grzCsvOutput.textContent = state.grz.join(', '));
      dom.grzMainCount && (dom.grzMainCount.textContent = `1/${state.grz.length}`);
      dom.grzSqlCount && (dom.grzSqlCount.textContent = `${state.grz.length}`);
      dom.grzCsvCount && (dom.grzCsvCount.textContent = `${state.grz.length}`);
      parts.push(`${state.grz.length} ГРНЗ`);
    }

    dom.status && (dom.status.textContent = `✅ Найдено: ${parts.join(', ')}`);
    dom.debug && (dom.debug.innerHTML = `Текст: ${dom.input.value.trim().length} | Пост: ${state.numbers.length} | UUID: ${state.uuids.length} | ГРНЗ: ${state.grz.length}`);
  } else {
    dom.result && (dom.result.style.display = 'block');
    if (dom.status) {
      dom.status.textContent = '❌ Данные не найдены';
      dom.status.className = 'status error';
    }
    document.querySelectorAll('.result-card').forEach(c => (c.style.display = 'none'));
    dom.debug && (dom.debug.textContent = '');
  }

  dom.queryDbBtn && (dom.queryDbBtn.style.display = hasNumbers ? 'block' : 'none');
  dom.dbResultsContainer && (dom.dbResultsContainer.style.display = 'none');
}
