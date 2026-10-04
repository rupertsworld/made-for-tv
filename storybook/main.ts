import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: ['./stories/*.stories.ts'],
  framework: { name: '@storybook/html-vite', options: {} },
  // allowedHosts accepts requests addressed to this machine by its tailnet name, so Television can show the live server.
  core: { disableTelemetry: true, allowedHosts: ['rubot'] },
};

export default config;
