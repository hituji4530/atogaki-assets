// ui/app.html から 2つを作る：
//   public/index.html … Worker が配信する管理画面
//   dist/demo.html    … Worker のコードをブラウザ内で動かす単体デモ（sql.js を CDN から読む）
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SQLJS = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm.js';
const ui = readFileSync('ui/app.html', 'utf8');
const split = ui.indexOf('<div class="wrap">');
const head = ui.slice(0, split);
const body = ui.slice(split);

mkdirSync('public', { recursive: true });
writeFileSync('public/index.html', `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}</head>
<body>
${body}</body>
</html>
`);

if (process.argv.includes('--demo')) {
  const out = await build({
    entryPoints: ['demo/browser.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    write: false,
    loader: { '.sql': 'text' },
    legalComments: 'none',
  });
  const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/demo.html', `${head}<script src="${SQLJS}"></script>
<script>${js}</script>
${body}`);
  console.log('dist/demo.html', Math.round(js.length / 1024), 'KB');
}
console.log('public/index.html');
