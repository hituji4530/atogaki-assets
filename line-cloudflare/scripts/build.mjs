// ui/app.html から 2つを作る：
//   public/index.html … Worker が配信する管理画面
//   dist/demo.html    … Worker のコードをブラウザ内で動かす単体デモ（sql.js を CDN から読む）
//   demo-template.html … 同じデモの配布用。line-builder スキルが設計を差し込んで使う（リポジトリに含める）
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

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

// デモの DB は migrations/*.sql を番号順につないだもので作る（本番の D1 と同じ形になる）
const migrationsPlugin = {
  name: 'migrations',
  setup(b) {
    b.onResolve({ filter: /^virtual:schema$/ }, () => ({ path: 'schema', namespace: 'migrations' }));
    b.onLoad({ filter: /.*/, namespace: 'migrations' }, () => ({
      contents: readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()
        .map((f) => readFileSync(`migrations/${f}`, 'utf8')).join('\n'),
      loader: 'text',
    }));
  },
};

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
    plugins: [migrationsPlugin],
  });
  const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
  mkdirSync('dist', { recursive: true });
  // <!--LINE_DESIGN--> の位置に line-builder スキルが window.__DESIGN__ を差し込む
  const demo = `${head}<!--LINE_DESIGN-->
<script src="${SQLJS}"></script>
<script>${js}</script>
${body}`;
  writeFileSync('dist/demo.html', demo);
  writeFileSync('demo-template.html', demo);
  console.log('dist/demo.html, demo-template.html', Math.round(js.length / 1024), 'KB');
}
console.log('public/index.html');
