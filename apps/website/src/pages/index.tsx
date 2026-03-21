import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started"
          >
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            style={{ color: 'white', borderColor: 'white', marginLeft: '1rem' }}
            href="https://github.com/nest-modules/mailer"
          >
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: 'Built on Nodemailer',
    description:
      'Leverages the battle-tested Nodemailer library for reliable email delivery. Supports SMTP, SES, sendmail, and more.',
  },
  {
    title: 'Multiple Template Engines',
    description:
      'Choose from Handlebars, Pug, EJS, Liquid, or MJML for responsive emails. Mix and match as needed.',
  },
  {
    title: 'NestJS Native',
    description:
      'First-class NestJS integration with dependency injection, async configuration, and module patterns.',
  },
  {
    title: 'Multiple Transporters',
    description:
      'Configure multiple SMTP servers and switch between them per message. Add transporters dynamically at runtime.',
  },
  {
    title: 'CSS Inlining',
    description:
      'Built-in CSS inlining powered by css-inline ensures your emails render correctly across all clients.',
  },
  {
    title: 'Preview Emails',
    description:
      'Preview your emails in the browser during development with the preview-email integration.',
  },
];

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="feature-card text--center padding-horiz--md padding-vert--lg">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickInstall() {
  return (
    <section className={styles.quickInstall}>
      <div className="container">
        <div className="text--center margin-bottom--lg">
          <Heading as="h2">Quick Install</Heading>
        </div>
        <div className="row">
          <div className="col col--8 col--offset-2">
            <pre className={styles.installCode}>
              <code>pnpm add @nestjs-modules/mailer nodemailer</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <QuickInstall />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
