// script.js — 画面の処理だけ。
// 依存: window.VFS（vfs-loader.js）、window.PathEscapeCore（pe-core.js）。
// パスの解決・フィルターの判定は PathEscapeCore.resolve() に任せる。

const C = window.PathEscapeCore;

// 各フィルターの説明（画面のヒント）。STAGE_INFO.bypass と対応する
const STAGE_HINT = {
  none: {
    title: 'フィルターなし',
    flaw: 'フィルターがありません。そのまま上のディレクトリーへ戻れます。',
    how: 'ヒント: ../ を重ねて上に戻ります。\n例: ../../secrets/flag.txt\n\n/robots.txt で機密パスのヒントも探せます。',
  },
  raw: {
    title: '生の「..」を弾く',
    flaw: 'デコードする前の入力しか見ないので、エンコードされた .. を見逃します。',
    how: 'ヒント: .. を URL エンコード（%2e%2e）すると、生入力には .. が出ません。\n例: %2e%2e/%2e%2e/secrets/flag.txt',
  },
  strip: {
    title: '「../」を消す',
    flaw: '../ を消したあと、結果をもう一度見直しません。',
    how: 'ヒント: ../ を入れ子にすると、内側を消したあとに ../ が組み上がります。\n例: ....//....//secrets/flag.txt',
  },
  decode: {
    title: 'デコードして「..」を弾く',
    flaw: '1回だけデコードして確認し、その後の処理でもう1回デコードされます。',
    how: 'ヒント: 二重にエンコードすると、1回のデコードでは .. に戻りきりません。\n例: %252e%252e%252f%252e%252e%252fsecrets%252fflag.txt',
  },
  ext: {
    title: '拡張子チェック（画像だけ）',
    flaw: '末尾の拡張子だけ見て許可し、取得は \\0（ヌルバイト）で切ります。',
    how: 'ヒント: 末尾に %00.png を足すと、拡張子は .png で通り、取得は .txt になります。\n例: ../../secrets/flag.txt%00.png',
  },
};

// 出力に出す、途中経過の各段の見出し
const STEP_LABEL = {
  input: '入力', sanitized: 'フィルター通過後', decoded: 'URLデコード後', normalized: '正規化後', resolved: '取得パス',
};

document.addEventListener('vfs:loaded', init);
document.addEventListener('DOMContentLoaded', () => {
  if (window.VFS) init();
  initTabs();
  initAccordions();
  initHelp();
});

let inited = false;
function init() {
  if (inited || !window.VFS) return;
  inited = true;
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

  hintBtn.addEventListener('click', () => {
    const h = STAGE_HINT[stageSel.value];
    showHint(`【${h.title}】\n欠陥: ${h.flaw}\n\n${h.how}`);
  });

  function showHint(msg) {
    const hintContent = document.createElement('div');
    hintContent.className = 'hint-content';
    const hintText = document.createElement('span');
    hintText.className = 'hint-text';
    hintText.textContent = msg;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hint-close-btn';
    closeBtn.setAttribute('aria-label', 'ヒントを閉じる');
    closeBtn.textContent = '×';
    hintContent.appendChild(hintText);
    hintContent.appendChild(closeBtn);
    while (hintArea.firstChild) hintArea.removeChild(hintArea.firstChild);
    hintArea.appendChild(hintContent);
    hintArea.classList.remove('hidden');
    closeBtn.addEventListener('click', () => hintArea.classList.add('hidden'));
  }

  function log(msg) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    logEl.prepend(li);
  }

  function addBadge(text) {
    const b = document.createElement('span');
    b.className = 'flag-badge';
    b.textContent = text;
    badgeArea.appendChild(b);
  }

  // 途中経過を <pre> に組み立てる（textContent のみ）
  function stepsText(steps) {
    const lines = [];
    for (const key of Object.keys(STEP_LABEL)) {
      if (steps[key] === undefined) continue;
      lines.push(`${STEP_LABEL[key]}: ${steps[key].replace(/\u0000/g, '\\0')}`);
    }
    return lines.join('\n');
  }

  fetchBtn.addEventListener('click', () => {
    const userInput = pathInput.value.trim();
    const stage = stageSel.value;
    const mode = modeSel.value;
    if (!userInput) {
      outputEl.textContent = '// パスを入力してください';
      return;
    }
    const r = C.resolve(userInput, stage, mode, window.VFS);

    if (r.blocked) {
      outputEl.textContent = `// フィルター「${STAGE_HINT[stage].title}」でブロックされました\n\n入力: ${userInput}`;
      log(`ブロック: ${userInput}（フィルター=${stage}）`);
      return;
    }
    const trace = stepsText(r.steps);
    if (r.ok) {
      const body = String(r.content).replace(/\\n/g, '\n');
      outputEl.textContent = `// path: ${r.path}\n${trace}\n\n${body}`;
      log(`取得: ${r.path}（モード=${mode}, フィルター=${stage}）`);
      if (r.flag) addBadge('FLAG FOUND');
    } else if (r.error === 'denied') {
      outputEl.textContent = `// アクセス拒否: base の外です（safe モード）\n${trace}`;
      log(`拒否: ${r.path}（safe モード）`);
    } else {
      outputEl.textContent = `// ファイルが見つかりません\n${trace}`;
      log(`未検出: ${r.path}（入力=${userInput}）`);
    }
  });

  fileTreeEl.addEventListener('dblclick', (e) => {
    const t = e.target;
    if (t && t.textContent) pathInput.value = t.textContent.trim();
  });
}

// タブ
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach((button) => {
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
