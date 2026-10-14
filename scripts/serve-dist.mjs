import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('dist');
const port = Number(process.env.PORT ?? 4321); // set PORT to avoid colliding with another server
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.wasm': 'application/wasm' };

async function resolveFile(urlPath) {
  const p = join(root, normalize(decodeURIComponent(urlPath)));
  if (p !== root && !p.startsWith(root + sep)) return null;
  const s = await stat(p).catch(() => null);
  if (s?.isDirectory()) return join(p, 'index.html');
  return s ? p : null;
}

createServer(async (req, res) => {
  try {
  const file = await resolveFile(new URL(req.url ?? '/', 'http://x').pathname).catch(() => null);
  const ok = file && (await stat(file).catch(() => null));
  const target = ok ? file : join(root, '404.html');
  const body = await readFile(target).catch(() => null);
  res.writeHead(ok ? 200 : 404, { 'content-type': types[extname(target)] ?? 'application/octet-stream' });
  res.end(body ?? 'Not found');
  } catch {
    res.writeHead(400).end('Bad request');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving dist on http://localhost:${port}`));
