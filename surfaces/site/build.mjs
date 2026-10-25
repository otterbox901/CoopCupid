import { access, cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('.', import.meta.url));
const out = `${source}dist`;
await mkdir(`${out}/assets`, { recursive: true });
for (const name of ['index.html', 'styles.css', 'site.js', 'release-links.js']) await copyFile(`${source}${name}`, `${out}/${name}`);
await cp(`${source}assets`, `${out}/assets`, { recursive: true });
// In the app repository, use the extension's shared assets. Hosted source snapshots
// also include these files under assets so they remain independently buildable.
let fonts = `${source}assets/fonts`;
let mark = `${source}assets/mark.svg`;
try { await access(fonts); } catch { fonts = fileURLToPath(new URL('../extension/fonts', import.meta.url)); }
try { await access(mark); } catch { mark = fileURLToPath(new URL('../extension/icons/mark.svg', import.meta.url)); }
await cp(fonts, `${out}/assets/fonts`, { recursive: true });
await copyFile(mark, `${out}/assets/mark.svg`);
console.log(`Landing page built: ${out}`);
