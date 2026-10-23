/**
 * Client-side redirects for URLs of the old Docusaurus site, which GitHub
 * Pages cannot redirect on the server. Paths are relative to the site base
 * (`/mailer/`); `null` means "not a legacy URL".
 */

// Pages of the v3 docs, which is what `/docs/<page>` served before v4.
const v3Pages = new Set([
  'getting-started',
  'configuration',
  'adapters',
  'sending-emails',
  'advanced',
  'i18n',
  'events',
  'batch-sending',
  'queue',
  'health-check',
  'template-resolver',
]);

// Docusaurus blog posts lived at /blog/YYYY/MM/DD/<slug>.
const blogPosts = new Set([
  '2020-03-07-mailer',
  '2025-03-21-multiple-transporters',
  '2025-03-21-template-engines',
  '2025-03-21-testing-emails',
]);

export function legacyRedirect(path: string): string | null {
  const clean = `/${path.replace(/^\/+/, '')}`
    .replace(/\.html$/, '')
    .replace(/(.)\/$/, '$1');

  const doc = /^\/docs(?:\/(.*))?$/.exec(clean);
  if (doc) {
    const page = doc[1] ?? '';
    return v3Pages.has(page) ? `/v3/${page}` : '/v3/';
  }

  const post = /^\/blog\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)$/.exec(clean);
  if (post) {
    const slug = `${post[1]}-${post[2]}-${post[3]}-${post[4]}`;
    return blogPosts.has(slug) ? `/blog/${slug}` : '/blog/';
  }

  // Docusaurus blog listings: tags, archive, authors, pagination.
  if (/^\/blog\/(tags|archive|authors|page)(\/|$)/.test(clean)) {
    return '/blog/';
  }

  return null;
}
