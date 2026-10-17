// Build Bench (or one of its standalone apps) into a single self-contained HTML file.
//   node tools/build.mjs                       → dist/bench.html  (open it from disk, works offline)
//   node tools/build.mjs --artifact            → dist/bench-artifact.html (body-only, for claude.ai Artifacts)
//   node tools/build.mjs --entry qr.html       → dist/qr.html (the QR Codes app on its own)
//   node tools/build.mjs --entry qr.html --artifact → dist/qr-artifact.html
// No bundler: index.html marks the CSS and JS blocks; this inlines them in order.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const artifact = process.argv.includes('--artifact');
const entryArg = process.argv.indexOf('--entry');
const entry = entryArg > 0 ? process.argv[entryArg + 1] : 'index.html';
const name = entry === 'index.html' ? 'bench' : entry.replace(/\.html$/, '');

let html = read(entry);

const block = name => new RegExp(`<!-- build:${name} -->([\\s\\S]*?)<!-- /build:${name} -->`);
const srcs = (chunk, re) => [...chunk.matchAll(re)].map(m => m[1]);

const cssFiles = srcs(html.match(block('css'))[1], /href="([^"]+)"/g);
const jsFiles = srcs(html.match(block('js'))[1], /src="([^"]+)"/g);

const css = cssFiles.map(f => `/* ${f} */\n${read(f)}`).join('\n');
// Guard against a literal </script> inside any source file.
const js = [`window.Bench = window.Bench || {}; window.Bench.SINGLE_FILE = true;${artifact ? ' window.Bench.ARTIFACT = true;' : ''}`, ...jsFiles.map(f => `// ${f}\n${read(f)}`)]
  .join('\n;\n').replace(/<\/script/gi, '<\\/script');

const iconPath = html.match(/<link rel="icon" href="([^"]+)"/)[1];
const icon = 'data:image/svg+xml,' + encodeURIComponent(read(iconPath));

html = html
  .replace(block('css'), () => `<style>\n${css}\n</style>`)
  .replace(block('js'), () => `<script>\n${js}\n</script>`)
  .replace(/ *<link rel="manifest" href="[^"]+">\n/, '')
  .replace(`href="${iconPath}"`, `href="${icon}"`);

if (artifact) {
  // The artifact host supplies doctype/html/head/body; keep title, fonts, styles, app.
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', artifact ? `${name}-artifact.html` : `${name}.html`);
writeFileSync(out, html);
console.log(`Built ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, ${jsFiles.length} scripts, ${cssFiles.length} stylesheet)`);
