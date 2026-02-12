// js/parser/db.js
import { displayDbResults } from './render.js';

export async function queryDatabase(dom, numbers) {
  if (!numbers.length) return;

  dom.dbResultsContainer && (dom.dbResultsContainer.style.display = 'block');
  dom.dbResultsOutput && (dom.dbResultsOutput.innerHTML = '<p>Загрузка...</p>');

  const backendUrl = 'http://192.168.11.90:3003/query-violations';

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers }),
    });

    if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);

    const data = await response.json();
    displayDbResults(dom, data);
  } catch (error) {
    dom.dbResultsOutput && (dom.dbResultsOutput.innerHTML =
      `<p style="color: red;">Ошибка: ${error.message}. Убедитесь, что back-end сервер запущен.</p>`
    );
  }
}
