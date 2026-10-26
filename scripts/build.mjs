// Copies site/ to dist/ and fills in the absolute URL that canonical, og:image,
// structured data, robots.txt and the sitemap need (crawlers ignore relative ones).
// On Vercel it uses the production domain; set SITE_URL to override.
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'site');
const out = join(root, 'dist');

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = (process.env.SITE_URL || (host ? `https://${host}` : 'http://localhost:4820')).replace(/\/$/, '');

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });
for (const file of readdirSync(out)) {
  if (!['.html', '.xml', '.txt'].includes(extname(file))) continue;
  const path = join(out, file);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('__SITE_URL__', siteUrl));
}
console.log(`built dist/ for ${siteUrl}`);
