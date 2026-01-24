import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import logger from '../utils/logger.js';
import config from '../config/default.js';

/**
 * Генерация sitemap.xml
 * @param {string} domain - Домен для абсолютных URL
 */
export async function generateSitemap(domain) {
  try {
    // Сбор всех HTML-файлов
    const htmlFiles = await glob(`${config.output.html}/**/*.html`, {
      nodir: true,
      absolute: true
    });

    const now = new Date().toISOString();
    const urls = htmlFiles.map(filePath => {
      // Преобразование пути к URL
      const relativePath = path.relative(config.output.html, filePath);
      const urlPath = relativePath
        .replace(/\\/g, '/')
        .replace(/\.html$/, '')
        .replace(/\/index$/, '/');

      return {
        loc: `${domain}/${urlPath}`,
        lastmod: now,
        changefreq: 'weekly',
        priority: urlPath === '/' ? '1.0' : '0.8'
      };
    });

    // Формирование XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('')}
</urlset>`;

    // Запись файла
    const sitemapPath = path.join(config.output.html, 'sitemap.xml');
    await fs.mkdir(path.dirname(sitemapPath), { recursive: true });
    await fs.writeFile(sitemapPath, sitemap);

    // Генерация robots.txt
    const robots = `User-agent: *
Allow: /
Sitemap: ${domain}/sitemap.xml`;

    const robotsPath = path.join(config.output.html, 'robots.txt');
    await fs.writeFile(robotsPath, robots);

    logger.info('Generated sitemap.xml and robots.txt', {
      urls: urls.length,
      sitemap: sitemapPath
    });

    return { urls: urls.length };
  } catch (err) {
    logger.error('Failed to generate sitemap', { error: err.message });
    throw err;
  }
}
