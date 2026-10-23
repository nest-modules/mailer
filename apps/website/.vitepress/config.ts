import { defineConfig } from 'vitepress';

const repo = 'https://github.com/nest-modules/mailer';

// Pages of the archived v2 and v3 docs (same set and order in both).
const archivedPages = [
  ['Getting started', 'getting-started'],
  ['Configuration', 'configuration'],
  ['Template adapters', 'adapters'],
  ['Sending emails', 'sending-emails'],
  ['Advanced', 'advanced'],
  ['i18n', 'i18n'],
  ['Events', 'events'],
  ['Batch sending', 'batch-sending'],
  ['Queue (BullMQ)', 'queue'],
  ['Health check', 'health-check'],
  ['Template resolver', 'template-resolver'],
];

function archivedSidebar(major: '2' | '3', release: string) {
  return [
    {
      text: `v${major} (${release})`,
      items: [
        { text: 'Overview', link: `/v${major}/` },
        ...archivedPages.map(([text, page]) => ({
          text,
          link: `/v${major}/${page}`,
        })),
      ],
    },
    {
      text: 'Upgrading',
      items: [
        { text: 'Versions & upgrading', link: '/guide/versions' },
        ...(major === '2'
          ? [{ text: 'Migrating from v2 to v3', link: '/guide/migration-v3' }]
          : []),
        { text: 'Migrating to v4', link: '/guide/migration' },
        { text: 'Latest docs (v4)', link: '/guide/getting-started' },
      ],
    },
  ];
}

export default defineConfig({
  title: 'NestJS Mailer',
  description: 'A mailer module for the NestJS framework using Nodemailer',
  lang: 'en-US',
  base: '/mailer/',
  srcDir: 'docs',
  outDir: 'build',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: '/mailer/nestjs.svg' },
    ],
    ['link', { rel: 'alternate icon', href: '/mailer/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#e0234e' }],
  ],
  sitemap: {
    hostname: 'https://nest-modules.github.io/mailer/',
  },
  themeConfig: {
    logo: '/nestjs.svg',
    siteTitle: 'NestJS Mailer',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Blog', link: '/blog/', activeMatch: '/blog/' },
      { text: 'Playground', link: '/preview' },
      {
        text: 'v4 (latest)',
        items: [
          {
            items: [
              { text: 'v4 (latest)', link: '/guide/getting-started' },
              { text: 'v3', link: '/v3/' },
              { text: 'v2', link: '/v2/' },
            ],
          },
          {
            items: [{ text: 'Versions & upgrading', link: '/guide/versions' }],
          },
        ],
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/@nestjs-modules/mailer',
      },
    ],

    sidebar: {
      '/v3/': archivedSidebar('3', '3.0.x'),
      '/v2/': archivedSidebar('2', '2.3.x'),
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Versions & upgrading', link: '/guide/versions' },
            { text: 'Migrating to v4', link: '/guide/migration' },
            { text: 'Migrating from v2 to v3', link: '/guide/migration-v3' },
          ],
        },
        {
          text: 'Sending',
          items: [
            { text: 'Sending emails', link: '/guide/sending-emails' },
            { text: 'Mail classes', link: '/guide/mailables' },
            { text: 'Batch sending', link: '/guide/batch-sending' },
          ],
        },
        {
          text: 'Transports',
          items: [
            { text: 'HTTP transports', link: '/guide/http-transports' },
            { text: 'Dev transports', link: '/guide/dev-transports' },
          ],
        },
        {
          text: 'Background sending',
          items: [
            { text: 'Queue (BullMQ)', link: '/guide/queue' },
            { text: 'Transactional outbox', link: '/guide/outbox' },
          ],
        },
        {
          text: 'Templates',
          items: [
            { text: 'Adapters', link: '/guide/adapters' },
            { text: 'i18n', link: '/guide/i18n' },
            { text: 'Template resolver', link: '/guide/template-resolver' },
          ],
        },
        {
          text: 'Delivery',
          items: [
            {
              text: 'Reliability (retries, failover)',
              link: '/guide/reliability',
            },
            {
              text: 'Delivery rules (intercept, suppress)',
              link: '/guide/delivery-rules',
            },
            { text: 'Errors and validation', link: '/guide/errors' },
          ],
        },
        {
          text: 'Development & testing',
          items: [
            { text: 'Testing', link: '/guide/testing' },
            { text: 'Email previews (module)', link: '/guide/preview' },
          ],
        },
        {
          text: 'Operations',
          items: [
            { text: 'Events', link: '/guide/events' },
            { text: 'Health check', link: '/guide/health-check' },
            { text: 'Advanced', link: '/guide/advanced' },
          ],
        },
        {
          text: '@nestjs/mail',
          items: [
            { text: 'Interop with @nestjs/mail', link: '/guide/nestjs-mail' },
            { text: 'Comparison', link: '/guide/comparison' },
          ],
        },
      ],
      '/blog/': [
        {
          text: 'Blog',
          items: [
            { text: 'All posts', link: '/blog/' },
            { text: 'Mailer v4', link: '/blog/2026-10-23-v4' },
            {
              text: 'Testing Email Sending in NestJS',
              link: '/blog/2025-03-21-testing-emails',
            },
            {
              text: 'Using Multiple SMTP Transporters',
              link: '/blog/2025-03-21-multiple-transporters',
            },
            {
              text: 'Choosing a Template Engine',
              link: '/blog/2025-03-21-template-engines',
            },
            {
              text: 'Introducing @nestjs-modules/mailer',
              link: '/blog/2020-03-07-mailer',
            },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/apps/website/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
      options: {
        // Keep the archived v2 and v3 docs out of the search index, so
        // results always point at the current version.
        _render(src, env, md) {
          if (/^v[23]\//.test(env.relativePath)) return '';
          return md.render(src, env);
        },
      },
    },

    lastUpdated: {
      text: 'Last updated',
    },

    outline: {
      level: [2, 3],
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © ${new Date().getFullYear()} Nest Modules`,
    },
  },
});
