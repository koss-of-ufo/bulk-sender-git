// js/parser/dom.js
export function getDom() {
  return {
    input: document.getElementById('inputText'),
    result: document.getElementById('result'),

    // Numbers
    output: document.getElementById('outputText'),
    sqlOutput: document.getElementById('sqlOutput'),
    numCsvOutput: document.getElementById('numCsvOutput'),
    cardNumMain: document.getElementById('cardNumMain'),
    cardNumSql: document.getElementById('cardNumSql'),
    cardNumCsv: document.getElementById('cardNumCsv'),
    mainCount: document.getElementById('mainCount'),
    sqlCount: document.getElementById('sqlCount'),
    numCsvCount: document.getElementById('numCsvCount'),

    // UUIDs
    uuidOutput: document.getElementById('uuidOutput'),
    cardUuidMain: document.getElementById('cardUuidMain'),
    uuidMainCount: document.getElementById('uuidMainCount'),

    // GRZ
    grzOutput: document.getElementById('grzOutput'),
    grzSqlOutput: document.getElementById('grzSqlOutput'),
    grzCsvOutput: document.getElementById('grzCsvOutput'),
    cardGrzMain: document.getElementById('cardGrzMain'),
    cardGrzSql: document.getElementById('cardGrzSql'),
    cardGrzCsv: document.getElementById('cardGrzCsv'),
    grzMainCount: document.getElementById('grzMainCount'),
    grzSqlCount: document.getElementById('grzSqlCount'),
    grzCsvCount: document.getElementById('grzCsvCount'),

    // DB
    queryDbBtn: document.getElementById('queryDbBtn'),
    dbResultsContainer: document.getElementById('dbResultsContainer'),
    dbResultsOutput: document.getElementById('dbResultsOutput'),

    // Buttons (bridge to sender.js)
    btnUseParsedUuids: document.getElementById('btnUseParsedUuids'),
    btnFillGrnMode: document.getElementById('btnFillGrnMode'),

    // Status
    status: document.getElementById('status'),
    debug: document.getElementById('debug'),
  };
}
