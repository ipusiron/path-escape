// normalize.js
// 軽量パス正規化ユーティリティ
// 入力: '/app/files/../etc/passwd' のようなパス（先頭に / を想定）
// 出力: 正規化されたパス '/app/etc/passwd'
function normalizePath(path) {
  if (!path) return '/';
  // replace backslashes then split
  path = path.replace(/\\/g, '/');
  const isAbs = path.startsWith('/');
  const parts = path.split('/');
  const stack = [];
  for (let p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (stack.length > 0) stack.pop();
      else if (!isAbs) stack.push('..'); // relative starting with .. (rare here)
    } else {
      stack.push(p);
    }
  }
  return (isAbs ? '/' : '') + stack.join('/');
}
