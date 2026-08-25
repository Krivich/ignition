// bin/cli.js
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises'; // <-- CRITICAL IMPORT
import {cleanupTmp, safeMkdir} from '../utils/fs.js';
import { RenderQueue } from '../core/queue.js';
import { generateSitemap } from '../core/sitemap.js';
import config from '../config/default.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

// Loading configuration
let appConfig = { ...config };

program
  .name('ignition')
  .description('Atomic prerender engine for SSR/CSR content')
  .version('1.0.0');

// Build command
program.command('build')
  .description('Build all templates once')
  .action(async () => {
    await runBuild();
  });

// Watch command
program.command('watch')
  .description('Watch for changes and rebuild automatically')
  .action(async () => {
    await runWatch();
  });

// Global options
program.option(
  '-s, --source <path>',
  'Source directory for templates and data',
  path.join(process.cwd(), 'input')
);

program.option(
  '-o, --output <path>',
  'Output directory for generated files',
  path.join(process.cwd(), 'output')
);

program.option(
  '-d, --domain <url>',
  'Domain for sitemap generation (e.g., https://example.com)',
  'https://example.com'
);

// Options processing
program.hook('preAction', (command) => {
    const opts = command.opts();

    // Determine base path for output
    const outputBase = path.resolve(opts.output);

    appConfig = {
        ...appConfig,
        source: {
            templates: path.resolve(opts.source, 'templates'),
            data: path.resolve(opts.source, 'data')
        },
        output: {
            public: path.join(outputBase, 'public'),
            html: path.join(outputBase, 'public'), // html = public
            templates: path.join(outputBase, 'public', 'templates'),
            data: path.join(outputBase, 'public', 'data'),
            assets: path.join(outputBase, 'public', 'assets') // <-- EXPLICITLY ADDING
        },
        tmpDir: path.resolve(opts.source, '..', 'tmp'),
        domain: opts.domain
    };

    // Update global configuration
    config.source = appConfig.source;
    config.output = appConfig.output;
    config.tmpDir = appConfig.tmpDir;
    config.domain = appConfig.domain;
});

// Build startup
async function runBuild() {
  logger.info('Starting Ignition build');

  try {
    // Clean up temporary files
    await cleanupTmp(appConfig.tmpDir);

    // Copy universal assets BEFORE rendering
    await copyUniversalAssets();

    // Create queue and start processing
    const queue = new RenderQueue();
    await queue.processQueue();

    // Generate sitemap
    await generateSitemap(appConfig.domain);

    logger.info('Build completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Build failed', { error: err.message });
    process.exit(1);
  }
}

// Watch startup
async function runWatch() {
  logger.info('Starting Ignition in watch mode');

  try {
    await cleanupTmp(appConfig.tmpDir);

    // Copy universal assets BEFORE rendering
    await copyUniversalAssets();

    const queue = new RenderQueue();

    // Event processing
    queue.on('task:success', (taskId) => {
      logger.info(`Task completed: ${taskId}`);
    });

    queue.on('processing:complete', async () => {
      await generateSitemap(appConfig.domain);
    });

    queue.on('processing:error', (err) => {
      logger.error('Processing error', { error: err.message });
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await queue.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    logger.error('Watch mode failed', { error: err.message });
    process.exit(1);
  }
}

async function copyUniversalAssets() {
    const assets = [
        {
            src: path.join(__dirname, '..', 'core', 'assets', 'ignition-pagination.js'),
            // Now copying to public/assets/
            dest: path.join(config.output.assets, 'ignition-pagination.js')
        }
    ];

    for (const asset of assets) {
        try {
            await safeMkdir(path.dirname(asset.dest));
            await fs.copyFile(asset.src, asset.dest);

            // Log relative path from project root
            const relativePath = path.relative(process.cwd(), asset.dest).replace(/\\/g, '/');
            logger.info(`✅ Copied universal asset: ${relativePath}`);
        } catch (err) {
            logger.error(`❌ Failed to copy asset: ${asset.src}`, { error: err.message });
        }
    }
}

// CLI startup
program.parse();
