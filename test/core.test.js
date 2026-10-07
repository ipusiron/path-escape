import test from 'node:test';
import assert from 'node:assert/strict';
import { core, VFS, read } from './load.js';

const C = core();
const vfs = VFS();
// 期待値は設計から手で決めた表（実装の出力ではない）。実装がこの表を再現するかを見る
const res = (input, stage, mode = 'vulnerable') => C.resolve(input, stage, mode, vfs);
const label = (input, stage, mode = 'vulnerable') => {
  const x = res(input, stage, mode);
  if (x.blocked) return 'BLOCK';
  if (x.ok) return x.flag ? 'FLAG' : 'OK';
  return x.error === 'denied' ? 'DENY' : '404';
};

test('パスの正規化はスタック方式。.. で1つ戻り、\\ は / にそろえる', () => {
  assert.equal(C.normalizePath('/app/files/../etc/passwd'), '/app/etc/passwd');
  assert.equal(C.normalizePath('/app/files/../../etc/passwd'), '/etc/passwd');
  assert.equal(C.normalizePath('/app/files/..\\..\\etc/passwd'), '/etc/passwd');
  assert.equal(C.normalizePath('/a/./b/./c'), '/a/b/c');
  assert.equal(C.normalizePath('/a/b/../../../x'), '/x', '根より上には行かない');
  assert.equal(C.normalizePath('../../etc'), 'etc', '相対の先頭の .. は保持（絶対化しない）');
  assert.equal(C.normalizePath(''), '/');
});

test('URLデコードは1回。壊れた並びはそのまま返す', () => {
  assert.equal(C.urlDecodeOnce('%2e%2e%2f'), '../');
  assert.equal(C.urlDecodeOnce('%252e'), '%2e', '二重エンコードは1回では %2e までしか戻らない');
  assert.equal(C.urlDecodeOnce('%ZZ'), '%ZZ', '壊れた並びはそのまま');
  assert.equal(C.urlDecodeOnce('%00'), '\u0000');
});

test('ヌルバイト以降を切る。画像の拡張子の判定', () => {
  assert.equal(C.truncateAtNull('/secrets/flag.txt\u0000.png'), '/secrets/flag.txt');
  assert.equal(C.truncateAtNull('/a/b'), '/a/b');
  assert.ok(C.endsWithImageExt('x.PNG') && C.endsWithImageExt('x.jpg') && C.endsWithImageExt('x.gif'));
  assert.ok(!C.endsWithImageExt('x.txt') && !C.endsWithImageExt('x.md'));
});

test('ステージと手法は5つで、各ステージに狙いの手法の例がある', () => {
  assert.deepEqual(C.STAGE_IDS, ['none', 'raw', 'strip', 'decode', 'ext']);
  for (const s of C.STAGE_IDS) assert.ok(C.STAGE_INFO[s], s);
  assert.equal(C.STAGE_INFO.none.bypass, null);
  assert.deepEqual(C.STAGE_IDS.slice(1).map((s) => C.STAGE_INFO[s].bypass), ['urlencode', 'nested', 'double', 'nullbyte']);
});

// 各ステージを「狙いの手法」で破ると /secrets/flag.txt に届く（STAGE_INFO.example が実際に効く）
test('各ステージは、対応する手法の例でフラグに届く（vulnerable）', () => {
  for (const s of C.STAGE_IDS) {
    const x = res(C.STAGE_INFO[s].example, s);
    assert.ok(x.ok && x.path === '/secrets/flag.txt' && x.flag, `${s}: ${C.STAGE_INFO[s].example} → ${JSON.stringify(x)}`);
  }
});

// 設計の真理値表。行=ステージ、列=手法。対角線が FLAG になる
test('ステージ×手法の真理値表（vulnerable）が設計どおり', () => {
  const tech = {
    plain: '../../secrets/flag.txt',
    urlencode: '%2e%2e/%2e%2e/secrets/flag.txt',
    nested: '....//....//secrets/flag.txt',
    double: '%252e%252e%252f%252e%252e%252fsecrets%252fflag.txt',
    nullbyte: '../../secrets/flag.txt%00.png',
  };
  const table = {
    none: { plain: 'FLAG', urlencode: 'FLAG', nested: '404', double: '404', nullbyte: 'FLAG' },
    raw: { plain: 'BLOCK', urlencode: 'FLAG', nested: 'BLOCK', double: '404', nullbyte: 'BLOCK' },
    strip: { plain: '404', urlencode: 'FLAG', nested: 'FLAG', double: '404', nullbyte: '404' },
    decode: { plain: 'BLOCK', urlencode: 'BLOCK', nested: 'BLOCK', double: 'FLAG', nullbyte: 'BLOCK' },
    ext: { plain: 'BLOCK', urlencode: 'BLOCK', nested: 'BLOCK', double: 'BLOCK', nullbyte: 'FLAG' },
  };
  for (const s of C.STAGE_IDS) {
    for (const [t, input] of Object.entries(tech)) {
      assert.equal(label(input, s), table[s][t], `${s} × ${t} (${input})`);
    }
  }
});

test('safe モードは、フラグに届く手法をすべて止める（DENY か 404、FLAG は出ない）', () => {
  const tech = ['../../secrets/flag.txt', '%2e%2e/%2e%2e/secrets/flag.txt', '....//....//secrets/flag.txt',
    '%252e%252e%252f%252e%252e%252fsecrets%252fflag.txt', '../../secrets/flag.txt%00.png'];
  for (const s of C.STAGE_IDS) {
    for (const input of tech) {
      const x = res(input, s, 'safe');
      assert.ok(!(x.ok && x.flag), `${s}: ${input} が safe で取れてはいけない`);
    }
  }
});

test('正規のファイルは両モードで取れる。安全モードは base の外を denied にする', () => {
  assert.equal(label('/app/files/readme.md', 'none'), 'OK');
  assert.equal(label('readme.md', 'raw'), 'OK');
  assert.equal(label('/app/files/public.txt', 'none', 'safe'), 'OK');
  assert.equal(label('../../secrets/flag.txt', 'none', 'safe'), 'DENY');
  // 取得結果にパスと中身が入る
  const x = res('/app/files/public.txt', 'none');
  assert.ok(x.ok && x.content.includes('PathEscape') && x.path === '/app/files/public.txt');
});

test('resolve は途中経過（steps）を返す。知らないステージ・モードは例外', () => {
  const x = res('%2e%2e/%2e%2e/secrets/flag.txt', 'raw');
  assert.deepEqual(Object.keys(x.steps), ['input', 'sanitized', 'decoded', 'normalized', 'resolved']);
  assert.equal(x.steps.decoded, '../../secrets/flag.txt');
  assert.equal(x.steps.resolved, '/secrets/flag.txt');
  assert.throws(() => res('x', 'nope'), RangeError);
  assert.throws(() => C.resolve('x', 'raw', 'nope', vfs), RangeError);
});

test('VFS にフラグと公開ファイルがある。中身に FLAG{ が含まれる', () => {
  assert.ok(vfs['/secrets/flag.txt'].includes('FLAG{'));
  assert.ok(vfs['/app/files/readme.md'] && vfs['/app/files/public.txt']);
});

test('対策の比較: 正規のファイルは3つとも許可、ブラックリストは入れ子・符号化で base の外へ漏れる', () => {
  // 正規のファイル: 3つの対策とも許可
  for (const input of ['/app/files/readme.md', 'readme.md', '/app/files/public.txt']) {
    const d = C.defenses(input, vfs);
    assert.ok(d.blacklist.allow && d.normalizeCheck.allow && d.allowlist.allow, input);
    assert.ok(!d.blacklist.leak, input);
  }
  // 入れ子・符号化: ブラックリストは漏れる（allow かつ leak）、正規化後チェックと許可リストは止める
  for (const input of ['....//....//secrets/flag.txt', '%2e%2e/%2e%2e/secrets/flag.txt']) {
    const d = C.defenses(input, vfs);
    assert.ok(d.blacklist.allow && d.blacklist.leak, `${input}: blacklist が漏れるべき`);
    assert.equal(d.blacklist.path, '/secrets/flag.txt', input);
    assert.ok(!d.normalizeCheck.allow, `${input}: 正規化後チェックは止める`);
    assert.ok(!d.allowlist.allow, `${input}: 許可リストは止める`);
  }
  // 正規化後チェック・許可リストは、どの手法でもフラグに届かせない
  for (const input of ['../../secrets/flag.txt', '....//....//secrets/flag.txt',
    '%252e%252e%252f%252e%252e%252fsecrets%252fflag.txt', '../../secrets/flag.txt%00.png']) {
    const d = C.defenses(input, vfs);
    assert.ok(!(d.normalizeCheck.allow && d.normalizeCheck.path === '/secrets/flag.txt'), `${input}: normalizeCheck`);
    assert.ok(!(d.allowlist.allow && d.allowlist.path === '/secrets/flag.txt'), `${input}: allowlist`);
  }
  assert.deepEqual(C.ALLOWLIST, ['/app/files/readme.md', '/app/files/public.txt']);
});

test('pe-core.js に innerHTML などの危険な書き込みがない', () => {
  const src = read('js/pe-core.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|document\.write|eval\(|new Function/);
});
