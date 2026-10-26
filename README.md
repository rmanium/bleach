# Ichigo: Every Form, One Shot

A scroll-driven fan tribute to Bleach, released on October 26, 2026, the day the anime ends after 22 years. Nine of Ichigo Kurosaki's forms, from Zangetsu to True Tensa Zangetsu, are joined into one unbroken shot that plays as you scroll.

Unofficial and non-commercial. Bleach and all of its characters are © Tite Kubo / Shueisha. Every image and frame is AI-generated fan art.

## How it works

`site/` is plain static HTML, CSS and JS, with no framework.

- **The film.** It is 801 WebP frames, scrubbed on a canvas by scroll position.
  - `frames/d` holds the desktop frames at 1280×720.
  - `frames/m` holds the phone frames, a 720×1280 centre crop.
- **The text.** All copy is real HTML in `index.html`, including the chapters, tribute, FAQ and alt text. `app.js` only fades it in and out.
- **Without JS.** The page starts in a stills layout. Visitors without JS, or with reduced motion turned on, get every chapter as text and images.
- **SEO.** Covers canonical, Open Graph and Twitter tags, JSON-LD (WebSite, WebPage, an ItemList of the forms, FAQPage), `robots.txt` and an image sitemap.

## Build

```bash
node scripts/build.mjs   # copies site/ → dist/ and fills in absolute URLs
```

Canonical, `og:image`, structured data, `robots.txt` and `sitemap.xml` need absolute URLs. `site/` holds a `__SITE_URL__` placeholder, and the build swaps it for:

1. `SITE_URL` if set, otherwise
2. `https://$VERCEL_PROJECT_PRODUCTION_URL` on Vercel (the production domain, including a custom domain), otherwise
3. `http://localhost:4820`.

To preview locally:

```bash
node scripts/build.mjs && python3 -m http.server 4820 --directory dist
```

## Deploy (Vercel)

1. Import this repo in Vercel. `vercel.json` sets the build command and the output directory (`dist`), and adds cache headers for the frames. No framework preset is needed.
2. If you add a custom domain, redeploy afterwards so the canonical and OG URLs pick it up. You can also set `SITE_URL` in the project's environment variables.
3. Add the site to Google Search Console and submit `/sitemap.xml`.
