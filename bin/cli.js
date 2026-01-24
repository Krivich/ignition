#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanupTmp } from '../utils/fs.js';
import { RenderQueue } from '../core/queue.js';
import { generateSitemap } from '../core/sitemap.js';
import config from '../config/default.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

// Загрузка конфигурации
let appConfig = { ...config };

program
  .name('ignition')
  .description('Atomic prerender engine for SSR/CSR content')
  .version('1.0.0');

// Команда сборки
program.command('build')
  .description('Build all templates once')
  .action(async () => {
    await runBuild();
  });

// Команда отслеживания
program.command('watch')
  .description('Watch for changes and rebuild automatically')
  .action(async () => {
    await runWatch();
  });

// Глобальные опции
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

// Обработка опций
program.hook('preAction', (command) => {
  const opts = command.opts();

  appConfig = {
    ...appConfig,
    source: {
      templates: path.resolve(opts.source, 'templates'),
      data: path.resolve(opts.source, 'data')
    },
    output: {
      html: path.resolve(opts.output, 'html'),
      templates: path.resolve(opts.output, 'templates'),
      data: path.resolve(opts.output, 'data')
    },
    tmpDir: path.resolve(opts.source, '..', 'tmp'),
    domain: opts.domain
  };

  // Обновление конфигурации в модулях
  config.source = appConfig.source;
  config.output = appConfig.output;
  config.tmpDir = appConfig.tmpDir;
});

// Запуск сборки
async function runBuild() {
  logger.info('Starting Ignition build');

  try {
    // Очистка временных файлов
    await cleanupTmp(appConfig.tmpDir);

    // Создание очереди и запуск обработки
    const queue = new RenderQueue();
    await queue.processQueue();

    // Генерация sitemap
    await generateSitemap(appConfig.domain);

    logger.info('Build completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Build failed', { error: err.message });
    process.exit(1);
  }
}

// Запуск отслеживания
async function runWatch() {
  logger.info('Starting Ignition in watch mode');

  try {
    await cleanupTmp(appConfig.tmpDir);

    const queue = new RenderQueue();

    // Обработка событий
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

// Запуск CLI
program.parse();
