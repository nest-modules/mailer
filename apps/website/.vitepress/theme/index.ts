import type { Theme } from 'vitepress';
import { inBrowser, withBase } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import TemplatePreview from './components/TemplatePreview.vue';
import VersionBanner from './components/VersionBanner.vue';
import { legacyRedirect } from './legacy-redirects';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('TemplatePreview', TemplatePreview);
    app.component('VersionBanner', VersionBanner);

    if (!inBrowser) return;

    // Old Docusaurus URLs (/docs/<page>, /blog/YYYY/MM/DD/<slug>). The first
    // call is the initial load, which for a missing page is GitHub Pages'
    // 404.html: replace the location so the old URL leaves no history entry.
    const base = withBase('/');
    let initial = true;
    router.onBeforeRouteChange = (href) => {
      const first = initial;
      initial = false;
      const url = new URL(href, location.origin);
      if (!url.pathname.startsWith(base)) return;
      const target = legacyRedirect(url.pathname.slice(base.length));
      if (!target) return;
      const to = withBase(target) + url.search + url.hash;
      if (first) location.replace(to);
      else router.go(to);
      return false;
    };
  },
} satisfies Theme;
