import test from 'node:test';
import assert from 'node:assert/strict';
import { read, load } from './load.js';

const { MESSAGES } = load('js/messages.js').PathMessages;
const I18N = load('js/i18n.js').PathI18n;
const html = read('index.html');
const JAPANESE = new RegExp('[' + [[0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x9fff], [0xff00, 0xffef]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');

test('日本語と英語の辞書は同じキーを持ち、置き場所（{name}）もそろう', () => {
  const ja = Object.keys(MESSAGES.ja);
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), [...ja].sort());
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of ja) assert.equal(ph(MESSAGES.en[k]), ph(MESSAGES.ja[k]), k);
  assert.ok(ja.length >= 200, String(ja.length));
});

test('英語の文言に日本語の文字がない（言語の切り替えボタンの「日本語」だけは例外）', () => {
  for (const [k, v] of Object.entries(MESSAGES.en)) {
    if (k === 'ui.langButton') continue;
    assert.doesNotMatch(v, JAPANESE, k);
  }
  assert.equal(MESSAGES.en['ui.langButton'], '日本語');
  assert.equal(MESSAGES.ja['ui.langButton'], 'EN');
});

test('index.html の data-i18n のキーは辞書にあり、書いた日本語は辞書の日本語と同じ', () => {
  const pairs = [...html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.ok(pairs.length > 100, String(pairs.length));
  for (const [k, text] of pairs) {
    assert.ok(k in MESSAGES.ja, `辞書にないキー: ${k}`);
    // 実行時は辞書の値が使われる。HTML の既定テキストは、インラインコードの前後の空白だけ違ってよい
    assert.equal(text.trim(), MESSAGES.ja[k].trim(), k);
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const part of m[1].split(';')) assert.ok(part.split(':')[1] in MESSAGES.ja, part);
  }
});

test('index.html の表示テキストは、コードと一部の固定語を除いて data-i18n で差し替わる', () => {
  const stripped = html
    .replace(/<pre>[\s\S]*?<\/pre>/g, '')
    .replace(/<code>[\s\S]*?<\/code>/g, '')
    .replace(/<[a-z0-9]+\b[^>]*\bdata-i18n="[\w.]+"[^>]*>[^<]*<\/[a-z0-9]+>/g, '')
    .replace(/\b(placeholder|aria-label|title)="[^"]*"/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = stripped.split('\n').filter((l) => JAPANESE.test(l));
  assert.deepEqual(lines, []);
});

test('初期の言語: ?lang= → 保存した選択 → ブラウザーの言語（日本語以外は英語）', () => {
  assert.equal(I18N.KEY, 'path-escape-lang');
  assert.equal(I18N.initialLanguage('?lang=en', 'ja', ['ja-JP']), 'en');
  assert.equal(I18N.initialLanguage('?x=1&lang=ja', 'en', ['en-US']), 'ja');
  assert.equal(I18N.initialLanguage('?lang=fr', null, ['ja-JP']), 'ja');
  assert.equal(I18N.initialLanguage('', 'en', ['ja-JP']), 'en');
  assert.equal(I18N.initialLanguage('', null, ['ja']), 'ja');
  assert.equal(I18N.initialLanguage('', null, ['fr-FR', 'ja']), 'en');
  assert.equal(I18N.initialLanguage('', 'xx', []), 'en');
});

test('フィルター・途中経過・対策のキーは、計算部の id と対応してそろう', () => {
  const C = load('js/pe-core.js').PathEscapeCore;
  for (const s of C.STAGE_IDS) {
    for (const part of ['title', 'flaw', 'how']) assert.ok(`hint.${s}.${part}` in MESSAGES.ja, `hint.${s}.${part}`);
    assert.ok(`ui.stage${s[0].toUpperCase()}${s.slice(1)}` in MESSAGES.ja, s);
  }
  for (const id of ['blacklist', 'normalizeCheck', 'allowlist']) assert.ok(`defense.${id}` in MESSAGES.ja, id);
});
