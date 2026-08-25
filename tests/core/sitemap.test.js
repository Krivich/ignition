import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import os from 'os';
import { generateSitemap } from '../../engine/core/sitemap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('generateSitemap', () => {
  let tmpDir;
  let originalHtml;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ignition-sitemap-'));

    // Create some HTML files
    await fs.mkdir(path.join(tmpDir, 'catalog', 'books', 'page'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'landing'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'catalog', 'books', 'page', '1.html'), '<h1>Page 1</h1>');
    await fs.writeFile(path.join(tmpDir, 'catalog', 'books', 'page', '2.html'), '<h1>Page 2</h1>');
    await fs.writeFile(path.join(tmpDir, 'landing', 'default.html'), '<h1>Landing</h1>');

    // Store original config values
    originalHtml = (await import('../../engine/config/default.js')).default.output.html;
    // Temporarily override config
    const config = (await import('../../engine/config/default.js')).default;
    config.output.html = tmpDir;
  });

  afterEach(async () => {
    // Restore config
    const config = (await import('../../engine/config/default.js')).default;
    config.output.html = originalHtml;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates sitemap.xml with all HTML files', async () => {
    const result = await generateSitemap('https://example.com');
    const sitemap = await fs.readFile(path.join(tmpDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://example.com/catalog/books/page/1</loc>');
    expect(sitemap).toContain('<loc>https://example.com/catalog/books/page/2</loc>');
    expect(sitemap).toContain('<loc>https://example.com/landing/default</loc>');
    expect(result.urls).toBe(3);
  });

  it('generates robots.txt with sitemap reference', async () => {
    await generateSitemap('https://example.com');
    const robots = await fs.readFile(path.join(tmpDir, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robots).toContain('User-agent: *');
  });

  it('uses weekly changefreq', async () => {
    await generateSitemap('https://example.com');
    const sitemap = await fs.readFile(path.join(tmpDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<changefreq>weekly</changefreq>');
  });
});
