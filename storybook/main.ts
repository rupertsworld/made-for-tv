import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: ['./stories/*.stories.ts'],
  framework: { name: '@storybook/html-vite', options: {} },
  // STORYBOOK_ALLOWED_HOSTS optionally lists, comma-separated, other host names the server accepts, such as the network name of the machine.
  core: { disableTelemetry: true, allowedHosts: process.env.STORYBOOK_ALLOWED_HOSTS?.split(',') },
};

export default config;
