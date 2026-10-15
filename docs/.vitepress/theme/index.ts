import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import WalletDiagram from './WalletDiagram.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('WalletDiagram', WalletDiagram);
  },
} satisfies Theme;
