import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import logger from '../utils/logger.js';
import config from '../config/default.js';

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate a domain string for use in sitemap.xml / robots.txt.
 * @param {string} domain
 * @returns {string} trimmed and validated domain
 */
function validateDomain(domain) {
  const d = String(domain).trim();
  if (!/^https?:\/\/[a-zA-Z0-9._-]+(:[0-9]+)?(\/.*)?$/.test(d)) {
    logger.warn(`Sitemap domain looks unusual: ${d}. Proceeding anyway.`);
  }
  return d;
}

/**
 * Generate sitemap.xml
 * @param {string} domain - Domain for absolute URLs
 */
export async function generateSitemap(domain) {
  try {
    const safeDomain = validateDomain(domain);

    // Collect all HTML files
    const htmlFiles = await glob(`${config.output.html}/**/*.html`, {
      nodir: true,
      absolute: true
    });

    const now = new Date().toISOString();
    const urls = htmlFiles.map(filePath => {
      // Convert path to URL
      const relativePath = path.relative(config.output.html, filePath);
      const urlPath = relativePath
        .replace(/\\/g, '/')
        .replace(/\.html$/, '')
        .replace(/\/index$/, '/');

      return {
        loc: `${escapeXml(safeDomain)}/${escapeXml(urlPath)}`,
        lastmod: now,
        changefreq: 'weekly',
        priority: urlPath === '/' ? '1.0' : '0.8'
      };
    });

    // Generate XML
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

    // Write file
    const sitemapPath = path.join(config.output.html, 'sitemap.xml');
    await fs.mkdir(path.dirname(sitemapPath), { recursive: true });
    await fs.writeFile(sitemapPath, sitemap);

    // Generate robots.txt
    const robots = `User-agent: *
Allow: /
Sitemap: ${escapeXml(safeDomain)}/sitemap.xml`;

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
