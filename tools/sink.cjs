// Dev-only helper: receives a base64 image POST from the running app and writes
// it to disk, so screenshots can be inspected without a display.
// SECURITY: This is strictly for local development and must never run in production.
// It is gated behind --allow flag and localhost-only binding with size limits.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ALLOW = process.argv.includes('--allow') || process.env.BOOTH_SINK_ALLOW === '1';
if (!ALLOW) {
  console.error('sink.cjs is dev-only. Run with `node tools/sink.cjs --allow` to enable.');
  process.exit(1);
}

const OUT = path.join(process.env.TMPDIR || process.env.TEMP || '.', 'booth-shots');
fs.mkdirSync(OUT, { recursive: true });

const MAX_BODY = 8 * 1024 * 1024; // 8MB base64 ~6MB binary
const ALLOWED_NAME = /^[a-zA-Z0-9._-]{1,64}\.(jpg|jpeg|png|webp)$/i;

http
  .createServer((req, res) => {
    // Only allow same-origin / localhost. Do not use wildcard.
    const origin = req.headers.origin || '';
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end('method not allowed');
    }
    let body = '';
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        req.destroy();
        res.writeHead(413);
        res.end('payload too large');
        return;
      }
      body += c;
    });
    req.on('end', () => {
      if (aborted) return;
      const rawName = (req.url || '/out.jpg').replace(/^\/+/, '').split('?')[0] || 'out.jpg';
      const name = rawName.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64) || 'out.jpg';
      if (!ALLOWED_NAME.test(name)) {
        res.writeHead(400);
        return res.end('invalid filename');
      }
      const file = path.join(OUT, path.basename(name));
      // Ensure we never escape OUT
      if (!file.startsWith(OUT)) {
        res.writeHead(400);
        return res.end('invalid path');
      }
      try {
        const buf = Buffer.from(body, 'base64');
        if (buf.length > 6 * 1024 * 1024) {
          res.writeHead(413);
          return res.end('decoded too large');
        }
        fs.writeFileSync(file, buf);
        console.log('wrote', file, buf.length, 'bytes');
        res.end('ok ' + file);
      } catch (e) {
        res.writeHead(400);
        res.end('invalid base64');
      }
    });
  })
  .listen(5174, '127.0.0.1', () => console.log('sink on 127.0.0.1:5174 ->', OUT));
