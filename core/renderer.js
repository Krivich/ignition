import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import {
  safeMkdir,
  atomicWrite,
  safeReadJson
} from '../utils/fs.js';
import {
  compileTemplate,
  parseDirectives,
  registerCorePartials,
  registerHelpers
} from './handlebars.js';
import { paginateCollection, preparePageData } from './pagination.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Инициализация Handlebars
await registerCorePartials();
registerHelpers();

/**
 * Рендеринг одного шаблона с данными
 * @param {string} templatePath - Путь к шаблону
 * @param {Object} data - Данные для рендеринга
 * @param {string} outputDir - Целевая директория
 * @param {string} baseName - Базовое имя файла
 */
export async function renderTemplate(templatePath, data, outputDir, baseName) {
  try {
    // Чтение шаблона
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const directives = parseDirectives(templateContent);
    const template = compileTemplate(templateContent);

    // Обработка директив
    if (directives.some(d => d.command === 'paginate')) {
      await handlePagination(directives, template, data, outputDir, baseName);
    } else {
      // Обычный рендеринг
      const html = template(data);
      const outputPath = path.join(outputDir, `${baseName}.html`);
      await safeMkdir(path.dirname(outputPath));
      await atomicWrite(outputPath, html);
      logger.info(`Rendered single page: ${outputPath}`);
    }

    return true;
  } catch (err) {
    logger.error(`Failed to render template: ${templatePath}`, {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Обработка пагинации
 * @param {Array} directives - Массив директив
 * @param {Function} template - Скомпилированный шаблон
 * @param {Object} data - Исходные данные
 * @param {string} outputDir - Целевая директория
 * @param {string} baseName - Базовое имя
 */
async function handlePagination(directives, template, data, outputDir, baseName) {
  const paginateDirective = directives.find(d => d.command === 'paginate');
  const {
    collection = 'items',
    perPage = config.pagination.defaultPerPage
  } = paginateDirective.args;

  // Разбиваем коллекцию на страницы
  const pages = paginateCollection(data, collection, perPage);

  // Генерируем страницы
  for (const page of pages) {
    const pageData = preparePageData(data, page, page.pageNumber);
    const html = template(pageData);

    // Определяем путь для страницы
    const pageDir = path.join(outputDir, baseName, 'page');
    const pagePath = path.join(pageDir, `${page.pageNumber}.html`);

    await safeMkdir(pageDir);
    await atomicWrite(pagePath, html);

    logger.debug(`Rendered page ${page.pageNumber} of ${page.totalPages}`, {
      path: pagePath,
      items: page.items.length
    });
  }

  logger.info(`Rendered ${pages.length} pages for ${baseName}`, {
    totalPages: pages.length,
    itemsPerPage: perPage
  });
}

/**
 * Генерация клиентских артефактов
 * @param {string} templatePath - Путь к шаблону
 * @param {string} dataPath - Путь к данным
 * @param {string} typeName - Тип контента (например, "catalog")
 * @param {string} itemName - Имя элемента (например, "books")
 */
export async function generateClientArtifacts(templatePath, dataPath, typeName, itemName) {
  try {
    // Копирование шаблона для клиента
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const clientTemplatePath = path.join(
      config.output.templates,
      typeName,
      `${itemName}.hbs`
    );
    await safeMkdir(path.dirname(clientTemplatePath));
    await atomicWrite(clientTemplatePath, templateContent);

    // Копирование данных для клиента
    const dataContent = await fs.readFile(dataPath, 'utf8');
    const clientDataPath = path.join(
      config.output.data,
      typeName,
      `${itemName}.json`
    );
    await safeMkdir(path.dirname(clientDataPath));
    await atomicWrite(clientDataPath, dataContent);

    logger.debug(`Generated client artifacts for ${typeName}/${itemName}`, {
      template: clientTemplatePath,
       clientDataPath
    });

    return true;
  } catch (err) {
    logger.error(`Failed to generate client artifacts`, {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}
