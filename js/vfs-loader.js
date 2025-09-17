// vfs-loader.js
// シンプルに data/vfs.json をフェッチして globalThis.VFS に格納する
(async function(){
  try {
    const res = await fetch('data/vfs.json', {cache: "no-store"});
    if(!res.ok) throw new Error('vfs.json load failed');
    const obj = await res.json();
    // ensure keys are normalized to simple absolute-like form
    window.VFS = Object.keys(obj).reduce((acc,k)=>{
      acc[k] = obj[k];
      return acc;
    }, {});
    console.log('VFS loaded', Object.keys(window.VFS));
    document.dispatchEvent(new Event('vfs:loaded'));
  } catch (e) {
    console.warn('Failed to load vfs.json — falling back to embedded VFS', e);
    // fallback minimal VFS
    window.VFS = {
      "/app/files/readme.md": "This is a fallback README.",
      "/app/files/public.txt": "Public sample.",
      "/secrets/flag.txt": "FLAG{day068_success}",
      "/etc/passwd": "root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:user:/home/user:/bin/bash"
    };
    document.dispatchEvent(new Event('vfs:loaded'));
  }
})();
