// script.js — 画面の処理だけ。
// 依存: window.VFS（vfs-data.js）、window.PathEscapeCore（pe-core.js）、
//       window.PathMessages（messages.js）、window.PathI18n（i18n.js）。
// パスの解決・フィルターの判定は PathEscapeCore.resolve() に任せる。文言は PathMessages.t() から取る。

const C = window.PathEscapeCore;
const M = window.PathMessages;
const I18N = window.PathI18n;
const t = (key, vars) => M.t(key, vars);

// 出力の途中経過の各段（キーの順に出す）
const STEP_KEYS = ['input', 'sanitized', 'decoded', 'normalized', 'resolved'];
const STAGE_IDS = ['none', 'raw', 'strip', 'decode', 'ext'];
const DEFENSE_IDS = ['blacklist', 'normalizeCheck', 'allowlist'];

// 言語をまたいで覚えておく「いまの状態」（切り替えたときに描き直すため）
const view = { hintStage: null, lastInput: null };

document.addEventListener('vfs:loaded', boot);
document.addEventListener('DOMContentLoaded', boot);

let booted = false;
function boot() {
  if (booted) return;
  // 言語を決めて静的な文言を当てる
  const lang = I18N.initialLanguage(location.search, I18N.readSaved(), navigator.languages);
  I18N.use(lang, document);
  initTabs();
  initAccordions();
  initHelp();
  initLang();
  if (window.VFS) {
    booted = true;
    initApp();
  }
}

function initLang() {
  const btn = document.getElementById('lang-btn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const next = M.getLanguage() === 'ja' ? 'en' : 'ja';
    I18N.use(next, document);
    I18N.save(next);
    relabel();
  });
}

// 言語を切り替えたとき、動的に作った部分（ヒント・対策の比較）を描き直す
let relabel = () => {};

function initApp() {
  const fileTreeEl = document.getElementById('file-tree');
  const stageSel = document.getElementById('stage');
  const modeSel = document.getElementById('mode');
  const hintBtn = document.getElementById('hint-btn');
  const hintArea = document.getElementById('hint-area');
  const fetchBtn = document.getElementById('fetch-btn');
  const pathInput = document.getElementById('path-input');
  const outputEl = document.getElementById('output');
  const logEl = document.getElementById('log');
  const badgeArea = document.getElementById('badge-area');
  const defenseBody = document.getElementById('defense-body');

  function renderTree() {
    const keys = Object.keys(window.VFS).filter((k) => k.startsWith('/app/files/'));
    while (fileTreeEl.firstChild) fileTreeEl.removeChild(fileTreeEl.firstChild);
    if (keys.length === 0) {
      fileTreeEl.textContent = '/app/files/ (no files)';
      return;
    }
    const ul = document.createElement('ul');
    keys.forEach((k) => {
      const li = document.createElement('li');
      li.textContent = k;
      ul.appendChild(li);
    });
    fileTreeEl.appendChild(ul);
  }
  renderTree();

  function stageHint(stage) {
    return t('hint.format', {
      title: t(`hint.${stage}.title`), flaw: t(`hint.${stage}.flaw`), how: t(`hint.${stage}.how`),
    });
  }

  function showHint(msg) {
    const hintContent = document.createElement('div');
    hintContent.className = 'hint-content';
    const hintText = document.createElement('span');
    hintText.className = 'hint-text';
    hintText.textContent = msg;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hint-close-btn';
    closeBtn.setAttribute('aria-label', t('ui.close'));
    closeBtn.textContent = '×';
    hintContent.appendChild(hintText);
    hintContent.appendChild(closeBtn);
    while (hintArea.firstChild) hintArea.removeChild(hintArea.firstChild);
    hintArea.appendChild(hintContent);
    hintArea.classList.remove('hidden');
    closeBtn.addEventListener('click', () => {
      hintArea.classList.add('hidden');
      view.hintStage = null;
    });
  }

  hintBtn.addEventListener('click', () => {
    view.hintStage = stageSel.value;
    showHint(stageHint(stageSel.value));
  });

  function log(msg) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    logEl.prepend(li);
  }

  function addBadge() {
    const b = document.createElement('span');
    b.className = 'flag-badge';
    b.textContent = t('badge.flag');
    badgeArea.appendChild(b);
  }

  function stepsText(steps) {
    const lines = [];
    for (const key of STEP_KEYS) {
      if (steps[key] === undefined) continue;
      lines.push(`${t(`step.${key}`)}: ${steps[key].replace(/\u0000/g, '\\0')}`);
    }
    return lines.join('\n');
  }

  function renderDefenses(userInput) {
    const d = C.defenses(userInput, window.VFS);
    while (defenseBody.firstChild) defenseBody.removeChild(defenseBody.firstChild);
    for (const id of DEFENSE_IDS) {
      const v = d[id];
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.setAttribute('scope', 'row');
      th.textContent = t(`defense.${id}`);
      const td = document.createElement('td');
      if (v.allow && v.leak) {
        td.textContent = t('defense.leak', { path: v.path });
        tr.className = 'defense-leak';
      } else if (v.allow) {
        td.textContent = t('defense.allow', { path: v.path });
        tr.className = 'defense-ok';
      } else {
        td.textContent = t('defense.block');
        tr.className = 'defense-block';
      }
      tr.appendChild(th);
      tr.appendChild(td);
      defenseBody.appendChild(tr);
    }
  }

  fetchBtn.addEventListener('click', () => {
    const userInput = pathInput.value.trim();
    const stage = stageSel.value;
    const mode = modeSel.value;
    if (!userInput) {
      outputEl.textContent = t('out.empty');
      return;
    }
    view.lastInput = userInput;
    renderDefenses(userInput);
    const r = C.resolve(userInput, stage, mode, window.VFS);

    if (r.blocked) {
      outputEl.textContent = t('out.blocked', { title: t(`hint.${stage}.title`), input: userInput });
      log(t('log.blocked', { input: userInput, stage }));
      return;
    }
    const trace = stepsText(r.steps);
    if (r.ok) {
      const body = String(r.content).replace(/\\n/g, '\n');
      outputEl.textContent = `// path: ${r.path}\n${trace}\n\n${body}`;
      log(t('log.fetched', { path: r.path, mode, stage }));
      if (r.flag) addBadge();
    } else if (r.error === 'denied') {
      outputEl.textContent = t('out.denied', { trace });
      log(t('log.denied', { path: r.path }));
    } else {
      outputEl.textContent = t('out.notfound', { trace });
      log(t('log.notfound', { path: r.path, input: userInput }));
    }
  });

  fileTreeEl.addEventListener('dblclick', (e) => {
    const target = e.target;
    if (target && target.textContent) pathInput.value = target.textContent.trim();
  });

  // 言語の切り替え時に、出ているヒントと対策の比較を描き直す
  relabel = () => {
    if (view.hintStage && !hintArea.classList.contains('hidden')) showHint(stageHint(view.hintStage));
    if (view.lastInput) renderDefenses(view.lastInput);
  };
}

// タブ
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = '1';
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}

// アコーディオン（座学）
function initAccordions() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach((header) => {
    if (header.dataset.wired) return;
    header.dataset.wired = '1';
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const isActive = header.classList.contains('active');
      headers.forEach((h) => {
        if (h !== header) {
          h.classList.remove('active');
          h.nextElementSibling.classList.remove('active');
        }
      });
      if (isActive) {
        header.classList.remove('active');
        content.classList.remove('active');
      } else {
        header.classList.add('active');
        content.classList.add('active');
      }
    });
  });
}

// ヘルプのモーダル
function initHelp() {
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');
  if (!helpBtn || helpBtn.dataset.wired) return;
  helpBtn.dataset.wired = '1';
  const helpClose = helpModal.querySelector('.help-close');
  helpBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
  helpClose.addEventListener('click', () => {
    helpModal.classList.add('hidden');
    document.body.style.overflow = '';
  });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
      helpModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });
}
