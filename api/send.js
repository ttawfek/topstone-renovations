// Vercel serverless function: delivers the contact form through Resend, then sends the
// visitor a short confirmation.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  required. Never exposed to the browser.
//   LEADS_TO        where quote requests go (comma-separated). Default topstone95@gmail.com
//   MAIL_FROM       sender; its domain must be verified in Resend.
//                   Default "Top Stone Renovations <info@topstonerenovations.com>"
//
// Browsers with JS post JSON and get JSON back. Without JS, the form posts here directly
// and is redirected back to contact-us.html#form-sent / #form-error.

const SITE = { name: 'Top Stone Renovations', phone: '(403) 969-0814' };
const LEADS_TO = process.env.LEADS_TO || 'topstone95@gmail.com';
const MAIL_FROM = process.env.MAIL_FROM || 'Top Stone Renovations <info@topstonerenovations.com>';
const PAGE = '/contact-us.html';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_FILL_MS = 2500; // humans don't fill a form faster than this; scripted posts often do

// single-line text: no control characters, trimmed, capped
const line = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
// multi-line text: keep newlines, drop other control characters
const block = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = s => s.split(',').map(x => x.trim()).filter(Boolean);

// The confirmation goes to an address the visitor typed, so it must not carry their
// free text: only a cleaned first name (letters only).
const firstName = name => (name.split(/\s+/)[0] || '').replace(/[^\p{L}'-]/gu, '').slice(0, 40);

// Validates one submission and builds both emails. Returns { error } or { lead, confirm }.
function compose(b) {
  const name = line(b.name, 120);
  const email = line(b.email, 200);
  const phone = line(b.phone, 40);
  const service = line(b.service, 120);
  const message = block(b.message, 4000);
  if (!name || !email) return { error: 'missing_fields' };
  if (!EMAIL_RE.test(email)) return { error: 'bad_email' };

  const hi = firstName(name);
  return {
    lead: {
      subject: `Quote request: ${name}${service ? `, ${service}` : ''}`,
      rows: [['Name', name], ['Email', email], ['Phone', phone || 'Not provided'], ['Project', service || 'Not specified'], ['Message', message || 'None']],
    },
    confirm: {
      subject: 'We received your Top Stone Renovations quote request',
      paras: [hi ? `Hi ${hi},` : 'Hello,', 'Thanks for reaching out to Top Stone Renovations. We have your message and will be in touch soon.'],
    },
  };
}

const leadText = rows => rows.map(([k, v]) => (v.includes('\n') ? `${k}:\n${v}` : `${k}: ${v}`)).join('\n');
const leadHtml = rows =>
  '<table cellpadding="6" style="border-collapse:collapse;font:14px/1.5 Arial,sans-serif;color:#191712">' +
  rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#595244;white-space:nowrap"><strong>${esc(k)}</strong></td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('') +
  '</table><p style="font:12px Arial,sans-serif;color:#595244">Sent from the topstonerenovations.com website. Reply to this email to answer the visitor directly.</p>';

const signoff = [`Questions in the meantime? Call or WhatsApp ${SITE.phone}, or just reply to this email.`, `— The ${SITE.name} team`];
const confirmText = paras => [...paras, ...signoff].join('\n\n');
const confirmHtml = paras =>
  '<div style="font:15px/1.6 Georgia,serif;color:#191712;max-width:560px">' +
  [...paras, ...signoff].map(p => `<p>${esc(p)}</p>`).join('') +
  '</div>';

async function resend(msg) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, ...msg }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

module.exports = async function handler(req, res) {
  const wantsJson = String(req.headers['content-type'] || '').includes('application/json');
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const reply = (status, out) => {
    if (wantsJson) return res.status(status).json(out);
    // no-JS form post: back to the page, where :target shows the matching message
    res.setHeader('Location', `${PAGE}#${out.ok ? 'form-sent' : 'form-error'}`);
    return res.status(303).end();
  };

  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }

  // only accept posts from this site's own pages (works on preview deployments too)
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.host) return reply(403, { ok: false, error: 'bad_origin' });
  }

  // bots: a filled honeypot or an instant submit look successful but send nothing
  const elapsed = Number(body.elapsed);
  if (body.company || (wantsJson && Number.isFinite(elapsed) && elapsed < MIN_FILL_MS)) return reply(200, { ok: true });

  const built = compose(body);
  if (built.error) return reply(400, { ok: false, error: built.error });

  if (!process.env.RESEND_API_KEY) {
    console.error('send: RESEND_API_KEY is not set');
    return reply(500, { ok: false, error: 'not_configured' });
  }

  const visitor = line(body.email, 200);
  const { lead, confirm } = built;
  const to = list(LEADS_TO);
  try {
    await resend({ to, reply_to: visitor, subject: lead.subject, text: leadText(lead.rows), html: leadHtml(lead.rows) });
  } catch (e) {
    console.error('send: lead email failed', e.message);
    return reply(502, { ok: false, error: 'send_failed' });
  }

  // the lead is safe at this point; a failed confirmation shouldn't make the visitor retry
  try {
    await resend({ to: [visitor], reply_to: to[0], subject: confirm.subject, text: confirmText(confirm.paras), html: confirmHtml(confirm.paras) });
  } catch (e) {
    console.error('send: confirmation email failed', e.message);
  }

  return reply(200, { ok: true });
};

// exposed for local tests
module.exports.compose = compose;
