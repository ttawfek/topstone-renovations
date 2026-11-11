// Local preview: serves the static site AND runs api/send.js, so the contact form works
// without `vercel dev`. No dependencies.
//
//   node dev-server.js            (or press F5 in VS Code)
//
// Email: if .env.local sets RESEND_API_KEY and LEADS_TO, real emails are sent through
// Resend. Otherwise it runs in dry-run mode and prints each email to the terminal instead.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;

// minimal .env.local loader (KEY=value per line, # comments)
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !raw.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const DRY_RUN = !process.env.RESEND_API_KEY || !process.env.LEADS_TO;
if (DRY_RUN) {
  // must be set before api/send.js is loaded (it reads them at require time)
  process.env.RESEND_API_KEY = 'dry-run';
  process.env.LEADS_TO = 'leads@example.test';
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      const msg = JSON.parse(opts.body);
      console.log('\n[dry-run] email not sent:\n  to:      %s\n  from:    %s\n  subject: %s\n%s\n',
        [].concat(msg.to).join(', '), msg.from, msg.subject, msg.text.replace(/^/gm, '    '));
      return new Response(JSON.stringify({ id: 'dry-run' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
}

const sendHandler = require('./api/send.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Vercel-style helpers on top of Node's req/res
async function runApi(handler, req, res) {
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) { try { req.body = JSON.parse(raw || '{}'); } catch (e) { req.body = raw; } }
  else if (type.includes('application/x-www-form-urlencoded')) req.body = Object.fromEntries(new URLSearchParams(raw));
  else req.body = raw;
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  try { await handler(req, res); }
  catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' }); }
}

function serveFile(res, file, status = 200) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function resolveStatic(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }
  const full = path.normalize(path.join(ROOT, p));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null; // no escaping the site folder
  const candidates = [full, path.join(full, 'index.html'), full + '.html'];
  return candidates.find(f => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/send') return runApi(sendHandler, req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const file = resolveStatic(pathname);
  if (file) return serveFile(res, file);
  serveFile(res, path.join(ROOT, '404.html'), 404);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving HTTP on 127.0.0.1 port ${PORT} (http://localhost:${PORT}/)`);
  console.log(DRY_RUN
    ? 'Contact form: dry-run mode (emails are printed here, not sent). Add RESEND_API_KEY and LEADS_TO to .env.local to send for real.'
    : `Contact form: sending through Resend to ${process.env.LEADS_TO}`);
});
