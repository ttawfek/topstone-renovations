# Top Stone Renovations

Plain HTML, CSS and JS. No framework and no build step.

## Run it

Press F5 in VS Code (`.vscode/launch.json` serves the site on http://localhost:8080), or:

```bash
node dev-server.js
```

`dev-server.js` also runs the `/api/send` function, so the contact form works locally. With no keys it runs in dry-run mode and prints each email in the terminal. To send real emails, create `.env.local` (git-ignored) with `RESEND_API_KEY=...` and `LEADS_TO=...`.

Don't use `python -m http.server`: it can't handle the form's POST, so the form always shows "That did not send."

## What lives where

| File | What it does |
| --- | --- |
| `index.html`, `services.html`, `contact-us.html`, `404.html` | Main pages |
| `kitchen-renovations.html` and the other service pages | One page per service, same structure |
| `css/styles.css` | All styles. Tokens at the top, numbered sections below |
| `js.js` | Menu, reveals, before/after sliders, videos, lightbox, form |
| `motion.js` | Scroll parallax only (`data-parallax`) |
| `api/send.js` | Emails the form through Resend |
| `dev-server.js` | Local preview server that also runs `api/send.js` |
| `vercel.json` | Redirects from the old GoDaddy URLs, security headers |

The header and footer are repeated on every page, so use find and replace across `*.html` to change them.
After editing CSS or JS, bump the `?v=` on those links in every page so browsers drop cached copies.

## Common edits

**Add a gallery photo:** put a `.webp` in `assets/<service>/`, then copy a line in that page's `<ul class="gallery">`:

```html
<li><a href="assets/flooring/new.webp" data-lightbox><img src="assets/flooring/new.webp" alt="Describe the photo" width="800" height="1000" loading="lazy" decoding="async"></a></li>
```

**Add a before/after slider:** copy a `<div class="ba" data-ba>` block and change the two images. Keep the `aspect-ratio` on it matched to the photos.

**Change colours or type:** edit the tokens at the top of `css/styles.css`.

**Replace the kitchen videos with clean files:** the current ones have a cream collage baked in, and the inline `style` on each `<video>` crops it out. See the comment above `.video-frame` in the CSS.

## Going live (Vercel)

Set these under Project → Settings → Environment Variables:

- `RESEND_API_KEY` (required)
- `LEADS_TO` (required): the inbox that receives quote requests
- `MAIL_FROM` (optional): the sender, on a domain verified in Resend. Defaults to `info@topstonerenovations.com`
