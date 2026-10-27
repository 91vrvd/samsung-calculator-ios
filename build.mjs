import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('./Web/', import.meta.url);
const core = await readFile(new URL('calc-core.mjs', root), 'utf8');
const app = await readFile(new URL('app.js', root), 'utf8');
const bundled = `${core.replaceAll('export function ', 'function ')}\n${app.replace(/^import .*?;\n/, '')}`;
new Function(bundled);
await writeFile(new URL('bundle.js', root), bundled);
console.log('Web/bundle.js 已生成');
