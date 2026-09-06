/**
 * Đo Lighthouse (mobile) cho màn hình học chính — chạy BA lần, ghi lại đủ môi trường.
 * Chạy: node e2e/lighthouse.mjs
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const URLS = (process.env.LH_URLS ?? `${BASE}/`).split(',');
const OUT = 'e2e/lighthouse';
mkdirSync(OUT, { recursive: true });

const chromePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chrome = await launch({
  chromePath,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
});

const buildVersion = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
})();

const report = { runAt: new Date().toISOString(), buildVersion, chromePath, results: [] };

try {
  for (const url of URLS) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const r = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        // preset mobile mặc định của Lighthouse: Moto G Power, 4x CPU slowdown, mạng Slow 4G
        undefined,
      );
      const c = r.lhr.categories;
      runs.push({
        performance: Math.round((c.performance?.score ?? 0) * 100),
        accessibility: Math.round((c.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((c['best-practices']?.score ?? 0) * 100),
        seo: Math.round((c.seo?.score ?? 0) * 100),
        lcpMs: Math.round(r.lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
        tbtMs: Math.round(r.lhr.audits['total-blocking-time']?.numericValue ?? 0),
        cls: Number((r.lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
        transferKb: Math.round((r.lhr.audits['total-byte-weight']?.numericValue ?? 0) / 1024),
      });
      if (i === 0) {
        writeFileSync(`${OUT}/${encodeURIComponent(url)}.json`, JSON.stringify(r.lhr, null, 2));
        report.environment = {
          lighthouseVersion: r.lhr.lighthouseVersion,
          userAgent: r.lhr.environment.hostUserAgent,
          formFactor: r.lhr.configSettings.formFactor,
          screenEmulation: r.lhr.configSettings.screenEmulation,
          throttling: r.lhr.configSettings.throttling,
        };
        const a11yFails = Object.values(r.lhr.audits).filter(
          (a) => a.score === 0 && r.lhr.categories.accessibility.auditRefs.some((x) => x.id === a.id),
        );
        report.accessibilityFailures = a11yFails.map((a) => ({ id: a.id, title: a.title }));
      }
    }
    const med = (k) => runs.map((x) => x[k]).sort((a, b) => a - b)[1];
    report.results.push({
      url,
      runs,
      median: {
        performance: med('performance'),
        accessibility: med('accessibility'),
        bestPractices: med('bestPractices'),
        seo: med('seo'),
        lcpMs: med('lcpMs'),
        tbtMs: med('tbtMs'),
        cls: med('cls'),
        transferKb: med('transferKb'),
      },
    });
    console.log(url, JSON.stringify(report.results.at(-1).median));
  }
} finally {
  await chrome.kill();
}

writeFileSync(`${OUT}/summary.json`, JSON.stringify(report, null, 2));
console.log('\nĐã ghi e2e/lighthouse/summary.json');
if (report.accessibilityFailures?.length) {
  console.log('Accessibility còn lỗi:', report.accessibilityFailures.map((a) => a.id).join(', '));
}
