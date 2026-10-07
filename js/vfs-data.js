// 仮想ファイルシステム（VFS）の中身。通常のスクリプトとして window.VFS に置く。
// JSON を fetch せず埋め込むことで、file:// で開いても動く（CORS・スキーム制限を受けない）。
// キーは絶対パス、値はファイルの中身（\n は表示のときに改行へ直す）。
(function (root) {
  'use strict';
  root.VFS = {
    '/app/files/readme.md': '# PathEscape\\n\\nこれは PathEscape の公開 README サンプルです。\\n\\n安全に学んでください。',
    '/app/files/public.txt': '公開ファイルです。Hello from PathEscape!',
    '/robots.txt': 'User-agent: *\\nDisallow: /admin/\\nDisallow: /secrets/\\nDisallow: /backup/\\nDisallow: /config/\\n\\n# Note: 制限ディレクトリーにはアクセスしないでください\\n# Flag file location: /secrets/flag.txt (学習用)',
    '/secrets/flag.txt': 'FLAG{day068_success}',
    '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\\nuser:x:1000:1000:user:/home/user:/bin/bash',
  };
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new Event('vfs:loaded'));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
