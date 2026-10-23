import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import TemplatePreview from './components/TemplatePreview.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('TemplatePreview', TemplatePreview);
  },
} satisfies Theme;
