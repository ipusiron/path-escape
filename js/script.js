// script.js
// 依存: window.VFS が vfs-loader.js により用意される。
// 依存: normalizePath() が normalize.js により用意される.

document.addEventListener('vfs:loaded', init);
document.addEventListener('DOMContentLoaded', ()=>{
  if(window.VFS) init();
  initTabs();
  initAccordions();
  initHelp();
});

function init(){
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

  // render file tree showing only /app/files/
  function renderTree(){
    const keys = Object.keys(window.VFS).filter(k => k.startsWith('/app/files/'));
    if(keys.length===0) {
      fileTreeEl.textContent = '/app/files/ (no files)';
      return;
    }
    const ul = document.createElement('ul');
    keys.forEach(k=>{
      const li = document.createElement('li');
      li.textContent = k.replace('/app/files/','/app/files/');
      ul.appendChild(li);
    });
    // Clear existing content safely
    while (fileTreeEl.firstChild) {
      fileTreeEl.removeChild(fileTreeEl.firstChild);
    }
    fileTreeEl.appendChild(ul);
  }
  renderTree();

  // hint logic
  hintBtn.addEventListener('click', ()=>{
    const stage = stageSel.value;
    if(stage==='beginner'){
      showHint("ヒント: 上のフォルダーに移動するには `../` を使います。\n例: ../../etc/passwd\n\n他にも /robots.txt で機密パスのヒントを探してみましょう。");
    } else if(stage==='intermediate'){
      showHint("ヒント: フィルターが `..` をブロックしますが、URLエンコードで回避可能です。\n例: %2e%2e/%2e%2e/etc/passwd\n\nまたは: %2e%2e%2f%2e%2e%2fsecrets%2fflag.txt");
    } else {
      showHint("ヒント: 高度なフィルターですが、いくつかの手法で回避可能です：\n\n1. ダブルスラッシュ: ..//..//etc/passwd\n2. 混合パターン: ..././..././etc/passwd\n3. 混合エンコード: ..%2f..%2fetc%2fpasswd\n4. Null文字: ../../etc/passwd%00.txt");
    }
  });

  function showHint(msg){
    // Create elements safely to prevent XSS
    const hintContent = document.createElement('div');
    hintContent.className = 'hint-content';

    const hintText = document.createElement('span');
    hintText.className = 'hint-text';
    hintText.textContent = msg; // Use textContent instead of innerHTML

    const closeBtn = document.createElement('button');
    closeBtn.className = 'hint-close-btn';
    closeBtn.setAttribute('aria-label', 'ヒントを閉じる');
    closeBtn.textContent = '×';

    hintContent.appendChild(hintText);
    hintContent.appendChild(closeBtn);

    hintArea.innerHTML = ''; // Clear existing content
    hintArea.appendChild(hintContent);
    hintArea.classList.remove('hidden');

    // Add close button functionality
    closeBtn.addEventListener('click', () => {
      hintArea.classList.add('hidden');
    });
  }

  // logging
  function log(msg){
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    logEl.prepend(li);
  }

  // badge update
  function addBadge(text){
    const b = document.createElement('span');
    b.textContent = text;
    b.style.padding = '6px 10px';
    b.style.marginRight = '8px';
    b.style.background = '#e6f2ff';
    b.style.borderRadius = '6px';
    b.style.fontFamily = 'monospace';
    badgeArea.appendChild(b);
  }

  // path resolution strategies
  const BASE = '/app/files/';

  function vulnerableFetch(userInput){
    // URL decode user input first (realistic web server behavior)
    const decodedInput = urlDecode(userInput);

    // 絶対パスならそのまま、相対なら BASE を付与
    let combined = decodedInput.startsWith('/') ? decodedInput : (BASE + decodedInput);
    combined = combined.replace(/\/+/g, '/');      // 重複スラッシュ除去
    const resolved = normalizePath(combined);      // '..' を解決
    // ※ 脆弱モードでは base チェックをしない（これが脆弱性のポイント）
    if (window.VFS[resolved] !== undefined) {
      return { ok: true, path: resolved, content: window.VFS[resolved] };
    }
    return { ok:false, error:'File not found' };
  }

  function safeFetch(userInput){
    // URL decode user input first (realistic web server behavior)
    const decodedInput = urlDecode(userInput);

    // combine then normalize and check base
    let combined = BASE + (decodedInput.startsWith('/') ? decodedInput.slice(1) : decodedInput);
    combined = combined.replace(/\/+/g, '/');
    const normalized = normalizePath(combined);
    if(!normalized.startsWith(BASE)){
      return {ok:false, error:'Access denied: path outside base (safe mode)'} ;
    }
    if(window.VFS[normalized] !== undefined) return {ok:true, path:normalized, content: window.VFS[normalized]};
    return {ok:false, error:'File not found (safe-mode lookup)'};
  }

  // URL decoding helper function
  function urlDecode(str) {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str; // If decoding fails, return original
    }
  }

  // Double URL decoding helper
  function doubleUrlDecode(str) {
    return urlDecode(urlDecode(str));
  }

  // Check for various bypass patterns that actually work
  function hasDoubleSlashBypass(input) {
    // Working patterns: ..// or ..././ etc
    return /\.\.\/\//.test(input) || /\.\.\/\.\.\//.test(input);
  }

  function hasUnicodeBypass(input) {
    // Unicode variations that work after decoding
    return input.includes('%uff0e%uff0e') || input.includes('\uff0e\uff0e');
  }

  function hasNullBypass(input) {
    // Null byte injection
    return input.includes('%00') || input.includes('\x00');
  }

  function hasMixedEncodingBypass(input) {
    // Mixed encoding patterns that might slip through
    return input.includes('..%2f') || input.includes('%2e%2e') || input.includes('.%2e');
  }

  // intermediate/advanced filter checks (blacklist examples)
  function isBlockedByFilter(input, stage){
    if(stage === 'beginner') return false;

    // intermediate: naive filter that only checks original input (common mistake)
    if(stage === 'intermediate'){
      // Allow advanced bypass techniques to work (easier stage should allow harder techniques)
      if(hasDoubleSlashBypass(input) ||
         hasMixedEncodingBypass(input) ||
         hasUnicodeBypass(input) ||
         hasNullBypass(input)) {
        return false; // Allow advanced bypasses
      }

      // Realistic but flawed implementation: only check raw input, not decoded
      if(input.includes('..')) return true;
      // This misses URL-encoded bypasses like %2e%2e
      return false;
    }

    // advanced: sophisticated blacklist with intentional gaps for educational purposes
    if(stage === 'advanced'){
      const singleDecoded = urlDecode(input);
      const doubleDecoded = doubleUrlDecode(input);
      const lowered = input.toLowerCase();

      // Allow certain bypass techniques to work for educational purposes
      if(hasDoubleSlashBypass(input) ||
         hasMixedEncodingBypass(input) ||
         hasUnicodeBypass(input) ||
         hasNullBypass(input)) {
        return false; // Allow these bypasses to work
      }

      // Block standard patterns but miss the advanced ones above
      if(singleDecoded.includes('..') ||
         doubleDecoded.includes('..')) {
        return true;
      }

      // Block most URL encoding but miss mixed encoding
      if(lowered.includes('%2e%2e%2f')) {
        return true;
      }

      return false;
    }
    return false;
  }

  // fetch button
  fetchBtn.addEventListener('click', ()=>{
    const userInput = pathInput.value.trim();
    const stage = stageSel.value;
    const mode = modeSel.value;
    if(!userInput){
      outputEl.textContent = '// パスを入力してください';
      return;
    }

    // filter simulation
    if(isBlockedByFilter(userInput, stage)){
      outputEl.textContent = `// 入力は現在のフィルターによってブロックされました（stage=${stage})`;
      log(`Blocked input: ${userInput} (stage=${stage})`);
      return;
    }

    let res;
    if(mode === 'vulnerable'){
      res = vulnerableFetch(userInput);
    } else {
      res = safeFetch(userInput);
    }

    if(res.ok){
      // Replace \n with actual line breaks for proper display
      const formattedContent = res.content.replace(/\\n/g, '\n');
      outputEl.textContent = `// path: ${res.path}\n\n${formattedContent}`;
      log(`Fetched: ${res.path} (mode=${mode}, stage=${stage})`);
      // if secret found, celebrate
      if(res.path === '/secrets/flag.txt' || (res.content && res.content.includes('FLAG{'))){
        addBadge('FLAG FOUND');
      }
    } else {
      outputEl.textContent = `// ERROR: ${res.error}`;
      log(`Fetch error: ${res.error} (input=${userInput})`);
    }
  });

  // quick presets on double-click of a tree item
  fileTreeEl.addEventListener('dblclick', (e)=>{
    const t = e.target;
    if(t && t.textContent){
      const p = t.textContent.trim();
      // p is like "/app/files/readme.md" in current render
      pathInput.value = p;
    }
  });

  // Remove auto-hide timeout for better UX when copying commands
}

// Tab functionality
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}

// Accordion functionality
function initAccordions() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const accordionContent = header.nextElementSibling;
      const isActive = header.classList.contains('active');

      // Close all other accordions (optional - remove if you want multiple open)
      accordionHeaders.forEach(h => {
        if (h !== header) {
          h.classList.remove('active');
          h.nextElementSibling.classList.remove('active');
        }
      });

      // Toggle current accordion
      if (isActive) {
        header.classList.remove('active');
        accordionContent.classList.remove('active');
      } else {
        header.classList.add('active');
        accordionContent.classList.add('active');
      }
    });
  });
}

// Help modal functionality
function initHelp() {
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');
  const helpClose = helpModal.querySelector('.help-close');

  // Open help modal
  helpBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  });

  // Close help modal
  helpClose.addEventListener('click', () => {
    helpModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
  });

  // Close on background click
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
      helpModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });
}
