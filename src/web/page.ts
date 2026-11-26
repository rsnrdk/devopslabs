import type { AppConfig } from '../config/app-config.js';
import type { VisitStats } from '../visits/visits.service.js';

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * One small server-rendered page, no frontend build needed.
 * It shows what matters for the labs: version, which pod answered, config values, and visits per pod.
 */
export function renderPage(
  config: AppConfig,
  stats: VisitStats | null,
): string {
  const rows = stats
    ? stats.byInstance
        .map(
          (r) =>
            `<tr><td>${escape(r.instance)}</td><td>${escape(r.version)}</td><td class="num">${r.count}</td></tr>`,
        )
        .join('')
    : '';
  const visits = stats
    ? `<p>Total visits: <b>${stats.total}</b></p>
       <table><thead><tr><th>Pod</th><th>Version</th><th class="num">Visits</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="warn">Database is unavailable</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>nest-devops ${escape(config.version)}</title>
<style>
  :root { color-scheme: light dark; --accent: #2563eb; --muted: #6b7280; --border: #d1d5db; }
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  h1 { margin-bottom: 4px; }
  .version { display: inline-block; background: var(--accent); color: #fff; padding: 4px 12px; border-radius: 999px; font-weight: 600; }
  .muted { color: var(--muted); }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  .num { text-align: right; }
  .warn { color: #dc2626; font-weight: 600; }
  code { font-size: 0.95em; }
  #log { font-family: ui-monospace, monospace; font-size: 13px; max-height: 220px; overflow: auto; }
</style>
</head>
<body>
  <h1>${escape(config.greeting)}</h1>
  <span class="version">v${escape(config.version)}</span>
  <span class="muted">environment: <b>${escape(config.environment)}</b></span>

  <div class="card">
    <p>This page was served by pod <code>${escape(config.instance)}</code></p>
    ${visits}
  </div>

  <div class="card">
    <p><b>Load balancing check</b>: ask <code>/api/info</code> 20 times and see which pods answered.</p>
    <button id="probe">Send 20 requests</button>
    <div id="log"></div>
  </div>

<script>
  document.getElementById('probe').addEventListener('click', async () => {
    const counts = {};
    for (let i = 0; i < 20; i++) {
      const info = await fetch('/api/info', { cache: 'no-store' }).then((r) => r.json());
      const key = info.instance + ' (v' + info.version + ')';
      counts[key] = (counts[key] || 0) + 1;
    }
    document.getElementById('log').innerHTML = Object.entries(counts)
      .map(([pod, n]) => pod + ': ' + n)
      .join('<br>');
  });
</script>
</body>
</html>`;
}
