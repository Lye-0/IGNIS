/** Build a portable chat-preview HTML from the separated distribution.
 * Usage: node scripts/build-preview.mjs [output.html]
 * The normal production build remains separated: npm run build.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'preview.html'));
if (output === path.join(root, 'index.html')) throw new Error('The separated index.html must not be overwritten. Choose another output path.');
let html = await readFile(path.join(root, 'index.html'), 'utf8');
const css = await readFile(path.join(root, 'styles.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`);
const scripts = [];
for (const match of html.matchAll(/<script defer src="([^"]+)"><\/script>/g)) {
  const file = path.resolve(root, match[1]);
  if (!file.startsWith(root)) throw new Error(`Unexpected script path: ${match[1]}`);
  const source = await readFile(file, 'utf8');
  if (/<\/script/i.test(source)) throw new Error(`Inline script closing tag found in ${match[1]}`);
  scripts.push(`<script>\n${source}\n</script>`);
}
html = html.replace(/\s*<script defer src="[^"]+"><\/script>/g, '');
html = html.replace('</body>', () => `${scripts.join('\n')}\n</body>`);
await mkdir(path.dirname(output), {recursive:true});
await writeFile(output, html, 'utf8');
console.log(`IGNIS II: portable preview created at ${output}`);
