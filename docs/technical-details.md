# PathEscape - 技術詳細 / Technical Details

本ドキュメントは PathEscape の高度な実装詳細、複雑なアルゴリズム、コアな仕組みについて開発者向けに解説します。

---

## 📋 目次

1. [パス正規化アルゴリズム](#パス正規化アルゴリズム)
2. [仮想ファイルシステム (VFS) 実装](#仮想ファイルシステム-vfs-実装)
3. [URLデコード処理と多段階フィルター](#urlデコード処理と多段階フィルター)
4. [教育的脆弱性の設計哲学](#教育的脆弱性の設計哲学)
5. [フィルター回避検出アルゴリズム](#フィルター回避検出アルゴリズム)
6. [リアルタイムパス解決エンジン](#リアルタイムパス解決エンジン)
7. [セキュリティ境界の実装](#セキュリティ境界の実装)

---

## パス正規化アルゴリズム

### 概要
PathEscape のコアとなるパス正規化は、実際のWebサーバーの挙動を忠実に再現しています。

### 実装詳細 (`js/normalize.js`)

```javascript
function normalizePath(path) {
  // 1. 重複スラッシュの除去
  path = path.replace(/\/+/g, '/');

  // 2. パス要素の分割と正規化
  const parts = path.split('/').filter(part => part !== '');
  const normalized = [];

  for (const part of parts) {
    if (part === '.') {
      // カレントディレクトリーは無視
      continue;
    } else if (part === '..') {
      // 親ディレクトリーへの移動
      if (normalized.length > 0) {
        normalized.pop();
      }
    } else {
      normalized.push(part);
    }
  }

  // 3. 絶対パスとして再構築
  return '/' + normalized.join('/');
}
```

### アルゴリズムの特徴

1. **実世界準拠**: Apache/Nginxと同等の正規化処理
2. **段階的処理**: スラッシュ正規化 → パース → 再構築
3. **境界処理**: ルートディレクトリーより上への移動を適切に処理

---

## 仮想ファイルシステム (VFS) 実装

### アーキテクチャ

```javascript
// data/vfs.json の構造
{
  "/app/files/readme.md": "ファイル内容...",
  "/secrets/flag.txt": "FLAG{day068_success}",
  "/etc/passwd": "root:x:0:0:..."
}
```

### 設計理念

1. **メモリ効率**: JSON形式での軽量ファイルシステム
2. **拡張性**: 新しいファイルの簡単な追加
3. **リアリズム**: 実際のUnixファイルシステム構造を模倣

### 動的ロード機構 (`js/vfs-loader.js`)

```javascript
// 非同期VFS読み込み
fetch('data/vfs.json')
  .then(response => response.json())
  .then(data => {
    window.VFS = data;
    document.dispatchEvent(new CustomEvent('vfs:loaded'));
  });
```

---

## URLデコード処理と多段階フィルター

### 処理フロー

```
ユーザー入力 → URLデコード → フィルター評価 → パス結合 → 正規化 → VFS参照
```

### デコード実装

```javascript
function urlDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    // 不正なエンコードの場合は元の文字列を返す
    return str;
  }
}

function doubleUrlDecode(str) {
  return urlDecode(urlDecode(str));
}
```

### 多段階フィルターアルゴリズム

#### Intermediate Stage フィルター
```javascript
if(stage === 'intermediate'){
  // 高度な回避手法は通す（教育目的）
  if(hasDoubleSlashBypass(input) ||
     hasMixedEncodingBypass(input) ||
     hasUnicodeBypass(input) ||
     hasNullBypass(input)) {
    return false; // 通す
  }

  // 生の入力のみチェック（現実的な脆弱実装）
  if(input.includes('..')) return true;
  return false;
}
```

#### Advanced Stage フィルター
```javascript
if(stage === 'advanced'){
  const singleDecoded = urlDecode(input);
  const doubleDecoded = doubleUrlDecode(input);

  // 特定の回避手法は意図的に通す
  if(hasDoubleSlashBypass(input) ||
     hasMixedEncodingBypass(input) ||
     hasUnicodeBypass(input) ||
     hasNullBypass(input)) {
    return false;
  }

  // 標準的なパターンはブロック
  if(singleDecoded.includes('..') ||
     doubleDecoded.includes('..')) {
    return true;
  }

  return false;
}
```

---

## 教育的脆弱性の設計哲学

### 現実的な段階設計

1. **Beginner**: フィルターなし（最も脆弱）
2. **Intermediate**: 単純なブラックリスト（URLエンコードで回避可能）
3. **Advanced**: 高度なブラックリスト（特定手法で回避可能）

### 意図的な脆弱性パターン

```javascript
// ダブルスラッシュ検出
function hasDoubleSlashBypass(input) {
  return /\.\.\/\//.test(input) || /\.\.\/\.\.\//.test(input);
}

// 混合エンコード検出
function hasMixedEncodingBypass(input) {
  return input.includes('..%2f') ||
         input.includes('%2e%2e') ||
         input.includes('.%2e');
}

// Unicode回避検出
function hasUnicodeBypass(input) {
  return input.includes('%uff0e%uff0e') ||
         input.includes('\uff0e\uff0e');
}

// Null文字検出
function hasNullBypass(input) {
  return input.includes('%00') || input.includes('\x00');
}
```

---

## フィルター回避検出アルゴリズム

### パターンマッチング戦略

各回避手法に対応する正規表現と文字列検索を組み合わせた検出エンジン：

```javascript
const BYPASS_PATTERNS = {
  doubleSlash: /\.\.\/\//,
  mixedDots: /\.\.\/\.\.\//,
  partialEncoding: /%2e%2e/i,
  fullEncoding: /%2e%2e%2f/i,
  mixedEncoding: /\.\.%2f/i,
  unicodeVariations: /%uff0e/i,
  nullInjection: /%00/
};
```

### 教育的配慮

- **段階的許可**: 下位レベルの手法が上位レベルでも使える
- **現実性**: 実際の攻撃で使われる手法を忠実に再現
- **学習曲線**: 初心者から上級者まで段階的に学習可能

---

## リアルタイムパス解決エンジン

### 解決フロー

```javascript
function vulnerableFetch(userInput) {
  // 1. URLデコード
  const decodedInput = urlDecode(userInput);

  // 2. パス結合
  let combined = decodedInput.startsWith('/') ?
    decodedInput : (BASE + decodedInput);

  // 3. 重複スラッシュ除去
  combined = combined.replace(/\/+/g, '/');

  // 4. パス正規化
  const resolved = normalizePath(combined);

  // 5. VFS参照
  if (window.VFS[resolved] !== undefined) {
    return { ok: true, path: resolved, content: window.VFS[resolved] };
  }

  return { ok: false, error: 'File not found' };
}
```

### Safe Mode との比較

```javascript
function safeFetch(userInput) {
  const decodedInput = urlDecode(userInput);

  // 相対パスの強制的な結合
  let combined = BASE + (decodedInput.startsWith('/') ?
    decodedInput.slice(1) : decodedInput);

  combined = combined.replace(/\/+/g, '/');
  const normalized = normalizePath(combined);

  // ベースディレクトリーチェック
  if(!normalized.startsWith(BASE)){
    return {ok:false, error:'Access denied: path outside base (safe mode)'};
  }

  // VFS参照
  if(window.VFS[normalized] !== undefined) {
    return {ok:true, path:normalized, content: window.VFS[normalized]};
  }

  return {ok:false, error:'File not found (safe-mode lookup)'};
}
```

---

## セキュリティ境界の実装

### ベースディレクトリー境界

```javascript
const BASE = '/app/files/';

// 境界チェック関数
function isWithinBase(normalizedPath, basePath) {
  return normalizedPath.startsWith(basePath);
}
```

### モード別セキュリティ境界

| モード | 境界チェック | 目的 |
|--------|-------------|------|
| Vulnerable | なし | 攻撃体験 |
| Safe | あり | 対策確認 |

### 教育的な境界設計

- **明確な違い**: Vulnerable/Safe モードの挙動の差を明確に
- **現実的な対策**: 実際のアプリケーションで使われる対策手法
- **視覚的フィードバック**: エラーメッセージで境界違反を明示

---

## パフォーマンス最適化

### VFS アクセス最適化

```javascript
// O(1) ハッシュテーブル参照
const result = window.VFS[normalizedPath];
```

### メモリ効率

- **遅延ロード**: VFS は必要時のみロード
- **軽量JSON**: ファイル内容の効率的な格納
- **イベント駆動**: VFS ロード完了をイベントで通知

---

## 拡張性とカスタマイズ

### 新しいファイルの追加

```json
// data/vfs.json に追加
{
  "/new/path/file.txt": "新しいファイルの内容"
}
```

### カスタムフィルターの実装

```javascript
function customFilter(input, stage) {
  // カスタムフィルターロジック
  return shouldBlock;
}
```

### 新しい回避手法の追加

```javascript
function hasCustomBypass(input) {
  // 新しい回避手法の検出
  return pattern.test(input);
}
```

---

## セキュリティ考慮事項

### クライアントサイド実装の安全性

1. **実サーバーアクセスなし**: すべてクライアントで完結
2. **機密情報なし**: VFS には教育用データのみ
3. **サンドボックス化**: ブラウザーのセキュリティ境界内で動作

### 教育目的の制限

- 実際の攻撃への応用は禁止
- 学習目的でのみ使用
- 第三者サーバーへの攻撃は厳禁

---

## デバッグとトラブルシューティング

### DevTools での動作確認

```javascript
// コンソールでの確認コマンド
console.log('VFS keys:', Object.keys(window.VFS || {}));

// パス正規化の確認
const testInput = '../../etc/passwd';
const result = normalizePath('/app/files/' + testInput);
console.log('Normalized:', result);
```

### 一般的な問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| VFS not loaded | VFS読み込み未完了 | `vfs:loaded`イベント待機 |
| Path not found | 正規化結果がVFSにない | パス正規化結果を確認 |
| Filter not working | フィルター条件の設定ミス | フィルター条件を見直し |

---

## 今後の拡張可能性

### 機能拡張の方向性

1. **新しい攻撃手法**: 最新の回避テクニックの追加
2. **詳細ログ**: 攻撃の詳細な解析機能
3. **統計機能**: 学習進捗の可視化
4. **多言語対応**: 国際化対応

### アーキテクチャの発展

- **モジュール化**: 機能別のコンポーネント分離
- **プラグイン機構**: サードパーティ拡張の対応
- **API化**: 外部ツールとの連携

---

## 関連リソース

- [メインドキュメント](../README.md)
- [テストケース](../tests/demo-cases.md)
- [脅威モデル](threat-model.md)
- [マニュアルチェックリスト](../tests/manual-checklist.md)