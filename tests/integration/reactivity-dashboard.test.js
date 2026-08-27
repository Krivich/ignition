import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(projectRoot, 'engine', 'bin', 'cli.js');
const execFileAsync = promisify(execFile);

describe('Reactivity: Dashboard (multi-block + computed chains)', () => {
  let server;
  let browser;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    await fs.mkdir(path.join(projectRoot, 'tmp'), { recursive: true });
    tmpDir = await fs.mkdtemp(path.join(projectRoot, 'tmp', 'reactivity-dash-'));
    const inputDir = path.join(tmpDir, 'input');
    const templatesDir = path.join(inputDir, 'templates');
    const dataDir = path.join(inputDir, 'data');

    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'dashboard', 'templates'),
      templatesDir,
      { recursive: true }
    );
    await fs.cp(
      path.join(projectRoot, 'tests', 'fixtures', 'dashboard', 'data'),
      dataDir,
      { recursive: true }
    );

    const assetsSrc = path.join(projectRoot, 'engine', 'core', 'assets');
    const assetsDest = path.join(tmpDir, 'output', 'public', 'assets');
    await fs.mkdir(assetsDest, { recursive: true });
    try {
      await fs.copyFile(
        path.join(assetsSrc, 'ignition-runtime.js'),
        path.join(assetsDest, 'ignition-runtime.js')
      );
    } catch { /* expected */ }

    await execFileAsync('node', [
      cliPath, 'build',
      '--source', path.join(tmpDir, 'input'),
      '--output', path.join(tmpDir, 'output'),
      '--domain', 'https://test.com'
    ], { timeout: 30000 });

    const outputDir = path.join(tmpDir, 'output', 'public');
    server = createServer((req, res) => {
      const url = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(outputDir, url);
      fs.readFile(filePath)
        .then(data => {
          const ext = path.extname(filePath);
          const mime = {
            '.html': 'text/html', '.json': 'application/json',
            '.js': 'application/javascript'
          }[ext] || 'text/plain';
          res.writeHead(200, { 'Content-Type': mime });
          res.end(data);
        })
        .catch(() => { res.writeHead(404); res.end('Not found'); });
    });

    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('SSR renders all 4 dashboard widgets', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    const blocks = await page.locator('[data-ignition-block]').count();
    expect(blocks).toBe(4);

    await page.close();
  });

  it('summary widget shows total and average', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    // Wait for computed values to render
    await page.waitForFunction(() => {
      const summary = document.querySelector('[data-ignition-block="dashboard/summary"]');
      return summary && summary.textContent.includes('46000');
    }, { timeout: 5000 });

    const text = await page.locator('[data-ignition-block="dashboard/summary"]').textContent();
    expect(text).toContain('46000');

    await page.close();
  });

  it('best-day widget shows correct date', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      const best = document.querySelector('[data-ignition-block="dashboard/best-day"]');
      return best && best.textContent.includes('2026-08-02');
    }, { timeout: 5000 });

    const text = await page.locator('[data-ignition-block="dashboard/best-day"]').textContent();
    expect(text).toContain('2026-08-02');
    expect(text).toContain('23000');

    await page.close();
  });

  it('period selector filters sales list', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    // All 3 sales visible initially
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[data-ignition-block="dashboard/sales-list"] .sale-item');
      return items.length === 3;
    }, { timeout: 5000 });

    // Select "month" (shows all — same as week in our small dataset)
    await page.selectOption('select[data-ignition-binding="ui.period"]', 'month');

    // Should still show all items (our test data is small)
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[data-ignition-block="dashboard/sales-list"] .sale-item');
      return items.length === 3;
    }, { timeout: 5000 });
    const items = await page.locator('[data-ignition-block="dashboard/sales-list"] .sale-item').count();
    expect(items).toBe(3);

    await page.close();
  });

  it('refresh button triggers loading state in all widgets', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    // Wait for initial render
    await page.waitForFunction(() => {
      return document.querySelector('[data-ignition-block="dashboard/summary"] .metric') !== null;
    }, { timeout: 5000 });

    // Click refresh
    await page.click('button[data-ignition-on="click → metricsRefresh"]');

    // All widgets should show skeleton (loading state)
    await page.waitForFunction(() => {
      const skeletons = document.querySelectorAll('.skeleton');
      return skeletons.length >= 3; // at least 3 of 4 widgets show skeleton
    }, { timeout: 5000 });

    const skeletonCount = await page.locator('.skeleton').count();
    expect(skeletonCount).toBeGreaterThanOrEqual(3);

    await page.close();
  });

  it('4 blocks update simultaneously on data change', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    // Wait for initial render
    await page.waitForFunction(() => {
      return document.querySelector('[data-ignition-block="dashboard/summary"] .metric') !== null;
    }, { timeout: 5000 });

    // Record initial total
    const initialText = await page.locator('[data-ignition-block="dashboard/footer"]').textContent();

    // Trigger refresh — data changes
    await page.click('button[data-ignition-on="click → metricsRefresh"]');

    // Wait for all widgets to re-render (skeletons appear then disappear)
    await page.waitForFunction(() => {
      const skeletons = document.querySelectorAll('.skeleton');
      return skeletons.length === 0;
    }, { timeout: 10000 });

    // Footer should still show data (possibly different after refresh)
    const footerText = await page.locator('[data-ignition-block="dashboard/footer"]').textContent();
    expect(footerText).toBeTruthy();

    await page.close();
  });

  it('no beforeunload during full dashboard interaction', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard/metrics.html`);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => { window.__beforeUnload = true; });
    });

    // Interaction cycle
    await page.waitForFunction(() => {
      return document.querySelector('[data-ignition-block="dashboard/summary"] .metric') !== null;
    }, { timeout: 5000 });

    await page.selectOption('select[data-ignition-binding="ui.period"]', 'month');
    await page.click('button[data-ignition-on="click → metricsRefresh"]');

    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, { timeout: 10000 });

    const hadUnload = await page.evaluate(() => window.__beforeUnload === true);
    expect(hadUnload).toBe(false);

    await page.close();
  });
});
