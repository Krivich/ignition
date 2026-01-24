import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import PQueue from 'p-queue';
import debounce from 'lodash.debounce';
import logger from '../utils/logger.js';
import { renderTemplate } from './renderer.js';
import { safeReadJson, safeMkdir } from '../utils/fs.js';
import config from '../config/default.js';

export class RenderQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = new PQueue({ concurrency: config.queue.concurrency });
    this.watcher = null;
    this.debouncedProcess = debounce(this.processQueue.bind(this), config.queue.debounce);
    this.processing = new Set();
    this.initialize();
  }

  initialize() {
    // Tracking changes in source files
    this.watcher = chokidar.watch([
      config.source.templates,
      config.source.data
    ], {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (path) => this.handleChange(path))
      .on('change', (path) => this.handleChange(path))
      .on('unlink', (path) => this.handleChange(path))
      .on('error', (error) => logger.error('Watcher error:', { error: error.message }));

    logger.info('Render queue initialized and watching for changes');
  }

  handleChange(filePath) {
    logger.debug('File changed:', { path: filePath });
    this.debouncedProcess();
  }

    async processQueue() {
        if (this.processing.size > 0) return;

        logger.info('Starting queue processing');
        this.emit('processing:start');

        try {
            // Just read all files in directories
            const templateFiles = await fs.readdir(config.source.templates, { withFileTypes: true });
            const templates = templateFiles
                .filter(f => f.isFile() && f.name.endsWith('.hbs'))
                .reduce((acc, f) => {
                    const name = path.basename(f.name, '.hbs');
                    acc[name] = path.join(config.source.templates, f.name);
                    return acc;
                }, {});
      const tasks = [];

      for (const [layout, templatePath] of Object.entries(templates)) {
        // Search for corresponding data
        const dataPath = path.join(
          config.source.data,
          layout,
          '*.json'
        );

        try {
          const dataFiles = await fs.readdir(path.dirname(dataPath), { withFileTypes: true })
            .then(files => files.filter(f => f.isFile() && f.name.endsWith('.json'))
            .map(f => path.join(path.dirname(dataPath), f.name)));

          for (const dataFile of dataFiles) {
            const dataset = path.basename(dataFile, '.json');
            const taskId = `${layout}/${dataset}`;

            if (this.processing.has(taskId)) continue;

            tasks.push({
              layout,
              templatePath,
              dataFile,
              dataset,
              taskId
            });
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            logger.error(`Error scanning data for ${layout}`, { error: err.message });
          }
        }
      }

      // Process tasks
      for (const task of tasks) {
        this.processing.add(task.taskId);

        this.queue.add(async () => {
          try {
            await this.processTask(task);
          } catch (err) {
            logger.error(`Task failed: ${task.taskId}`, { error: err.message });
          } finally {
            this.processing.delete(task.taskId);
          }
        });
      }

      await this.queue.onIdle();
      logger.info('Queue processing completed');
      this.emit('processing:complete');
    } catch (err) {
      logger.error('Queue processing failed', { error: err.message });
      this.emit('processing:error', err);
    }
  }



    async processTask(task) {
        const { layout, templatePath, dataFile, dataset, taskId } = task;

        logger.info(`🛠️ Processing task: ${taskId} (${layout}/${dataset})`);

        try {
            // Reading data
            const data = await safeReadJson(dataFile);

            // Adding dataset to context for templates
            const enhancedData = {
                ...data,
                dataset: dataset,
                layout: layout
            };

            // Determine output directories
            const htmlOutputDir = path.join(config.output.html, layout);

            // CRITICAL CHANGE: pass layout to renderTemplate
            await renderTemplate(
                templatePath,
                enhancedData,
                htmlOutputDir,
                dataset,
                layout // <-- CORRECT TEMPLATE NAME
            );

            const { generateClientArtifacts } = await import('./renderer.js');
            // Generate client artifacts
            await generateClientArtifacts(dataFile, layout, dataset);


            logger.info(`✅ Successfully processed: ${taskId}`);
            this.emit('task:success', taskId);
        } catch (err) {
            logger.error(`❌ Failed to process task: ${taskId}`, {
                error: err.message,
                stack: err.stack
            });
            this.emit('task:error', taskId, err);
            throw err;
        }
    }

  async close() {
    this.watcher?.close();
    await this.queue.onIdle();
    logger.info('Render queue closed');
  }
}
