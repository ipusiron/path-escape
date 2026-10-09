import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { core, VFS } from './load.js';

const C = core();
const vfs = VFS();
const root = new URL('../', import.meta.url);
const readme = fs.readFileSync(new URL('README.md', root), 'utf8');
const readmeEn = fs.readFileSync(new URL('README.en.md', root), 'utf8');

test('README の「このツールならではの使い方」を計算部で再計算（日英）', () => {
  const trav = '../../secrets/flag.txt';
  assert.equal(C.resolve(trav, 'none', 'vulnerable', vfs).flag, true);
  const safe = C.resolve(trav, 'none', 'safe', vfs);
  assert.equal(safe.ok, false);
  assert.equal(safe.path, '/secrets/flag.txt');
  assert.equal(C.resolve('....//....//secrets/flag.txt', 'strip', 'vulnerable', vfs).flag, true);
  assert.equal(C.resolve('../../secrets/flag.txt%00.png', 'ext', 'vulnerable', vfs).flag, true);
  assert.equal(C.BASE, '/app/files/');
  for (const md of [readme, readmeEn]) {
    assert.ok(md.includes('/app/files/') && md.includes('/secrets/flag.txt'));
    assert.ok(md.includes('%00'));
  }
});
