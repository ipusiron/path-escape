// PathEscape の計算部（DOM を使わない通常のスクリプト。globalThis.PathEscapeCore に置く）
// パスの正規化・URLデコード・欠陥フィルターの模型・取得の流れを、画面と切り離して置く。
// 教材の要点: 回避手法は「特定の欠陥フィルターを破る」もので、手法ごとに狙う相手が違う。
// ここではステージ（フィルター）を1つずつ模型化し、各ステージを破る手法が1つ対応する。
(function (root) {
  'use strict';

  // ---- パスの正規化（スタック方式。'..' で1つ戻る） ----
  // 入力は '/app/files/../etc/passwd' のような形。'\' は '/' にそろえる。
  function normalizePath(path) {
    if (!path) return '/';
    const unified = path.replace(/\\/g, '/');
    const isAbs = unified.startsWith('/');
    const stack = [];
    for (const part of unified.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (stack.length > 0) stack.pop();
        else if (!isAbs) stack.push('..'); // 相対パスの先頭の '..' は残す
      } else {
        stack.push(part);
      }
    }
    return (isAbs ? '/' : '') + stack.join('/');
  }

  // ---- URLデコード（1回。壊れた並びはそのまま返す） ----
  function urlDecodeOnce(s) {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  }

  // 末尾のヌルバイト以降を切る（C・古い PHP の open() の切り詰めを再現）
  const truncateAtNull = (s) => {
    const i = s.indexOf('\u0000');
    return i === -1 ? s : s.slice(0, i);
  };

  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif'];
  const endsWithImageExt = (s) => IMAGE_EXTS.some((e) => s.toLowerCase().endsWith(e));

  // ---- 欠陥フィルターの模型 ----
  // 各ステージ: { id, sanitize(raw)->raw', blocks(raw)->bool }。
  // sanitize した文字列が後段（デコード→正規化）に渡る。blocks が true なら拒否。
  // id ごとに「どんな欠陥か」「破る手法」が1対1に対応する（STAGE_INFO 参照）。
  const STAGES = {
    // フィルターなし。すべて通る
    none: { sanitize: (s) => s, blocks: () => false },
    // 生入力（デコード前）に '..' があれば拒否。URLエンコード %2e%2e で破れる
    raw: { sanitize: (s) => s, blocks: (s) => s.includes('..') },
    // '../' '..\' を1回のパスでまとめて消して、その結果を使う（str_replace の再走査なしバグ）。
    // 入れ子 '....//' は消したあとに '../' が組み上がるので破れる
    strip: { sanitize: (s) => s.replace(/\.\.[\\/]/g, ''), blocks: () => false },
    // 1回デコードしてから '..' を弾き、デコード済みを後段へ渡す（復号して転送する前段の模型）。
    // 後段がもう1回デコードするので、二重エンコード %252e%252e%252f は前段をすり抜けて破れる
    decode: { sanitize: (s) => urlDecodeOnce(s), blocks: (s) => urlDecodeOnce(s).includes('..') },
    // 許可した拡張子（画像）だけ通す。取得は後段でヌルバイトで切るので、
    // '...flag.txt%00.png' は拡張子チェックは .png で通り、取得は flag.txt になる
    ext: { sanitize: (s) => s, blocks: (s) => !endsWithImageExt(urlDecodeOnce(s)) },
  };
  const STAGE_IDS = Object.keys(STAGES);

  // ステージの説明と、それを破る手法（画面のヒント・座学・テストが参照する）
  const STAGE_INFO = {
    none: { bypass: null, example: '../../secrets/flag.txt' },
    raw: { bypass: 'urlencode', example: '%2e%2e/%2e%2e/secrets/flag.txt' },
    strip: { bypass: 'nested', example: '....//....//secrets/flag.txt' },
    decode: { bypass: 'double', example: '%252e%252e%252f%252e%252e%252fsecrets%252fflag.txt' },
    ext: { bypass: 'nullbyte', example: '../../secrets/flag.txt%00.png' },
  };

  const BASE = '/app/files/';

  // 取得の流れ（1回で評価する）。vfs は { パス: 中身 } のオブジェクト。
  // 返り値: { blocked } | { ok, path, content, flag } | { ok:false, error }
  // steps に各段の途中経過を入れる（画面で「どこで止まったか」を見せるため）
  function resolve(userInput, stageId, mode, vfs) {
    if (!STAGES[stageId]) throw new RangeError('unknown stage: ' + stageId);
    if (mode !== 'vulnerable' && mode !== 'safe') throw new RangeError('unknown mode: ' + mode);
    const stage = STAGES[stageId];
    const steps = { input: userInput };

    if (stage.blocks(userInput)) {
      return { blocked: true, stage: stageId, steps };
    }
    const sanitized = stage.sanitize(userInput);
    steps.sanitized = sanitized;
    const decoded = urlDecodeOnce(sanitized);
    steps.decoded = decoded;

    let combined = decoded.startsWith('/') ? decoded : BASE + decoded;
    combined = combined.replace(/\/+/g, '/');
    const normalized = normalizePath(combined);
    steps.normalized = normalized;
    const resolved = truncateAtNull(normalized);
    steps.resolved = resolved;

    if (mode === 'safe' && !resolved.startsWith(BASE)) {
      return { ok: false, error: 'denied', path: resolved, steps };
    }
    if (Object.prototype.hasOwnProperty.call(vfs, resolved)) {
      const content = vfs[resolved];
      return { ok: true, path: resolved, content, flag: typeof content === 'string' && content.includes('FLAG{'), steps };
    }
    return { ok: false, error: 'notfound', path: resolved, steps };
  }

  // ---- 対策の比較（safe の中身を3つに分けて見せる） ----
  // 入力を、代表的な3つの対策それぞれに通したときの結果を返す。フィルター（ステージ）とは別で、
  // 「正しい対策はどれで、同じ入力をどこで止めるか」を並べて見せるために使う。
  // 各対策: { id, allow: bool, path, reason }。allow=true は「このファイルを返す」
  const ALLOWLIST = ['/app/files/readme.md', '/app/files/public.txt'];

  // 入力を取得パスまで解決する（フィルターなし。デコード→結合→正規化→ヌルバイト切り）
  function resolvePath(userInput) {
    const decoded = urlDecodeOnce(userInput);
    const combined = (decoded.startsWith('/') ? decoded : BASE + decoded).replace(/\/+/g, '/');
    return truncateAtNull(normalizePath(combined));
  }

  function defenses(userInput, vfs) {
    const has = (p) => Object.prototype.hasOwnProperty.call(vfs, p);
    // 1) ブラックリスト（弱い対策）: '../' '..\' を消してから取得する。base チェックをしないので、
    //    消したあとに '../' が組み上がる入力（入れ子）や符号化で、base の外のファイルが漏れる
    const strippedPath = resolvePath(userInput.replace(/\.\.[\\/]/g, ''));
    // 2) 正規化してから base チェック（正しい対策。全部の手法を止める）
    const normPath = resolvePath(userInput);
    // 3) 許可リスト（最も厳しい）: あらかじめ決めたファイルだけ返す
    return {
      blacklist: { allow: has(strippedPath), path: strippedPath, leak: has(strippedPath) && !strippedPath.startsWith(BASE) },
      normalizeCheck: { allow: has(normPath) && normPath.startsWith(BASE), path: normPath, leak: false },
      allowlist: { allow: ALLOWLIST.includes(normPath) && has(normPath), path: normPath, leak: false },
    };
  }

  root.PathEscapeCore = {
    normalizePath, urlDecodeOnce, truncateAtNull, endsWithImageExt, resolvePath,
    STAGES, STAGE_IDS, STAGE_INFO, IMAGE_EXTS, BASE, ALLOWLIST, resolve, defenses,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
