import { renderPage } from './page.js';
import { loadConfig } from '../config/app-config.js';

const config = loadConfig({
  ADMIN_TOKEN: 't',
  DB_PASSWORD: 'p',
  APP_VERSION: '1.0.0',
  HOSTNAME: 'pod-a',
});

describe('renderPage', () => {
  it('shows version, pod name and visits', () => {
    const html = renderPage(config, {
      total: 3,
      byInstance: [{ instance: 'pod-a', version: '1.0.0', count: 3 }],
    });

    expect(html).toContain('v1.0.0');
    expect(html).toContain('pod-a');
    expect(html).toContain('<b>3</b>');
  });

  it('escapes values coming from configuration', () => {
    const html = renderPage(
      { ...config, greeting: '<script>alert(1)</script>' },
      null,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Database is unavailable');
  });
});
