import { createApp } from 'vue';
import { plugin, defaultConfig } from '@formkit/vue';
import { createMultiStepPlugin } from '@formkit/addons';
import { genesisIcons } from '@formkit/icons';
import '@formkit/themes/genesis';
import '@formkit/addons/css/multistep';
import './style.css';
import App from './App.vue';
import { httpsUrl, httpsOrigin } from './validation';

createApp(App)
  .use(
    plugin,
    defaultConfig({
      plugins: [createMultiStepPlugin()],
      rules: { https_url: httpsUrl, https_origin: httpsOrigin },
      messages: {
        en: {
          validation: {
            https_url:
              'Use an HTTPS URL without credentials, query or fragment.',
            https_origin:
              'Enter https:// and your service hostname only, such as https://wallet.acme.com. Remove any trailing slash or page path.',
          },
        },
      },
      icons: genesisIcons,
    }),
  )
  .mount('#app');
