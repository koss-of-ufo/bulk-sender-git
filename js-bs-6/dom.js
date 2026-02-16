// js/dom.js
export function getDom() {
  // DOM
  const csvFile = document.getElementById('csvFile');
  const textArea = document.getElementById('textArea');
  const sourceEl = document.getElementById('source');
  const btnPreview = document.getElementById('btnPreview');
  const btnSendOne = document.getElementById('btnSendOne');
  const btnSendAll = document.getElementById('btnSendAll');
  const btnStop = document.getElementById('btnStop');
  const btnDownloadErrors = document.getElementById('btnDownloadErrors');
  const btnDownloadReport = document.getElementById('btnDownloadReport');
  const previewBox = document.getElementById('previewBox');
  const logBox = document.getElementById('logBox');
  const totalEl = document.getElementById('total');
  const successEl = document.getElementById('success');
  const failEl = document.getElementById('fail');
  const progressEl = document.getElementById('progress');
  const inputTextEl = document.getElementById('inputText');

  const urlEl = document.getElementById('url');
  const authEl = document.getElementById('auth');
  const methodEl = document.getElementById('method');
  const modeEl = document.getElementById('mode');
  const modeSidebarEl = document.getElementById('modeSidebar');
  const payTypeEl = document.getElementById('payType');
  const classEl = document.getElementById('classValue');
  const delayEl = document.getElementById('delay');
  const grnEl = document.getElementById('grn');
  const commentEl = document.getElementById('comment');
  const uuidColEl = document.getElementById('uuidCol');
  const fastExtractEl = document.getElementById('fastExtract');
  const autoDownloadErrorsEl = document.getElementById('autoDownloadErrors');
  const skipPreviewEl = document.getElementById('skipPreview');
  const useFirstColIfHeaderEl = document.getElementById('useFirstColIfHeader');
  const autoClosePeriodsEl = document.getElementById('autoClosePeriods');

  const btnPause = document.getElementById('btnPause');
  const btnTransferText = document.getElementById('btnTransferText');
  const btnOpenPeriods = document.getElementById('btnOpenPeriods');
  const btnClosePeriods = document.getElementById('btnClosePeriods');

  return {
    csvFile, textArea, sourceEl,
    btnPreview, btnSendOne, btnSendAll, btnStop,
    btnDownloadErrors, btnDownloadReport,
    previewBox, logBox,
    totalEl, successEl, failEl, progressEl,
    inputTextEl,
    urlEl, authEl, methodEl, modeEl, modeSidebarEl, payTypeEl, classEl,
    delayEl, grnEl, commentEl, uuidColEl,
    fastExtractEl, autoDownloadErrorsEl,
    skipPreviewEl, useFirstColIfHeaderEl, autoClosePeriodsEl,
    btnPause, btnTransferText, btnOpenPeriods, btnClosePeriods,
  };
}
