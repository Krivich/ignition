import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import PQueue from 'p-queue';
import debounce from 'lodash.debounce';
import logger from '../utils/logger.js';
import { renderTemplate, generateClientArtifacts } from './renderer.js';
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
    // Отслеживание изменений в исходниках
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
    if (this.processing.size > 0) {
      logger.debug('Queue processing already in progress');
      return;
    }

    logger.info('Starting queue processing');
    this.emit('processing:start');

    try {
      // Сбор всех шаблонов
      const templates = await this.scanTemplates();
      const tasks = [];

      for (const [templateName, templatePath] of Object.entries(templates)) {
        // Поиск соответствующих данных
        const dataPath = path.join(
          config.source.data,
          templateName,
          '*.json'
        );

        try {
          const dataFiles = await fs.readdir(path.dirname(dataPath), { withFileTypes: true })
            .then(files => files.filter(f => f.isFile() && f.name.endsWith('.json'))
            .map(f => path.join(path.dirname(dataPath), f.name)));

          for (const dataFile of dataFiles) {
            const itemName = path.basename(dataFile, '.json');
            const taskId = `${templateName}/${itemName}`;

            if (this.processing.has(taskId)) continue;

            tasks.push({
              templateName,
              templatePath,
              dataFile,
              itemName,
              taskId
            });
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            logger.error(`Error scanning data for ${templateName}`, { error: err.message });
          }
        }
      }

      // Обработка задач
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

  async scanTemplates() {
    const templates = {};
    try {
      const files = await fs.readdir(config.source.templates, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.hbs')) {
          const name = path.basename(file.name, '.hbs');
          templates[name] = path.join(config.source.templates, file.name);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error('Error scanning templates', { error: err.message });
        throw err;
      }
    }

    return templates;
  }

  async processTask(task) {
    const { templateName, templatePath, dataFile, itemName, taskId } = task;

    logger.info(`Processing task: ${taskId}`);

    try {
      // Чтение данных
      const data = await safeReadJson(dataFile);

      // Определение выходных директорий
      const htmlOutputDir = path.join(config.output.html, templateName);
      const typeName = templateName;

      // Рендеринг
      await renderTemplate(templatePath, data, htmlOutputDir, itemName);

      // Генерация клиентских артефактов
      await generateClientArtifacts(templatePath, dataFile, typeName, itemName);

      logger.info(`Successfully processed: ${taskId}`);
      this.emit('task:success', taskId);
    } catch (err) {
      logger.error(`Failed to process task: ${taskId}`, { error: err.message });
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
