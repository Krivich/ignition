// core/renderer.js
import path from 'path';
import fs from 'fs/promises'; // <-- Добавляем импорт
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars'; // <-- ЯВНЫЙ ИМПОРТ
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
 * Копирование CSR-шаблона с правильной логикой путей
 * @param {string} templateName - Имя шаблона (catalog)
 * @param {string} csrTemplate - Имя CSR-шаблона (pagination)
 * @param {string} outputDir - Директория вывода
 */
async function copyCsrTemplate(templateName, csrTemplate, outputDir) {
    if (!csrTemplate) return false;

    // ПРАВИЛЬНЫЕ ПУТИ: ищем в поддиректории шаблона
    const sourceDir = path.join(config.source.templates, templateName);
    const sourcePath = path.join(sourceDir, `${csrTemplate}.hbs`);

    const outputTemplateDir = path.join(config.output.templates, templateName);
    const outputPath = path.join(outputTemplateDir, `${csrTemplate}.hbs`);

    try {
        // Проверяем существование файла
        await fs.access(sourcePath);

        // Создаем директории
        await safeMkdir(outputTemplateDir);

        // Копируем
        await fs.copyFile(sourcePath, outputPath);

        logger.info(`✅ Copied CSR template: ${templateName}/${csrTemplate}.hbs`);
        return true;

    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`⚠️ CSR template not found: ${sourcePath}`);
            // Пытаемся найти в корне шаблонов как fallback
            const fallbackPath = path.join(config.source.templates, `${csrTemplate}.hbs`);
            try {
                await fs.access(fallbackPath);
                await safeMkdir(outputTemplateDir);
                await fs.copyFile(fallbackPath, outputPath);
                logger.info(`✅ Used fallback CSR template: ${csrTemplate}.hbs`);
                return true;
            } catch (fallbackErr) {
                logger.error(`❌ CSR template not found in any location: ${csrTemplate}.hbs`, {
                    primary: sourcePath,
                    fallback: fallbackPath
                });
            }
        } else {
            logger.error(`❌ Failed to copy CSR template: ${sourcePath}`, {
                error: err.message
            });
        }
        return false;
    }
}

/**
 * Регистрация partials из директории шаблона
 * @param {string} templateName - Имя шаблона (catalog)
 * @param {string} templateBaseDir - Базовая директория шаблонов
 */
async function registerTemplatePartials(templateName, templateBaseDir) {
    const templateDir = path.join(templateBaseDir, templateName);

    try {
        // Проверяем существование директории
        await fs.access(templateDir);

        // Читаем все .hbs файлы в директории
        const files = await fs.readdir(templateDir);
        const partials = files.filter(f => f.endsWith('.hbs'));

        for (const file of partials) {
            const partialName = path.basename(file, '.hbs');
            const filePath = path.join(templateDir, file);
            const content = await fs.readFile(filePath, 'utf8');

            // Регистрируем partial с именем templateName/partialName
            Handlebars.registerPartial(`${templateName}/${partialName}`, content);
            logger.debug(`✅ Registered partial: ${templateName}/${partialName}`);
        }

        return partials.length;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            logger.error(`❌ Failed to register partials for ${templateName}`, {
                error: err.message
            });
        }
        return 0;
    }
}

/**
 * Основная функция рендеринга
 * @param {string} templatePath - Путь к корневому шаблону
 * @param {Object} data - Данные для рендеринга
 * @param {string} outputDir - Директория вывода
 * @param {string} itemName - Имя элемента (books)
 * @param {string} templateName - Имя шаблона (catalog) <-- КРИТИЧЕСКИ ВАЖНЫЙ ПАРАМЕТР
 */
export async function renderTemplate(templatePath, data, outputDir, itemName, templateName) {
    try {
        // 1. Регистрируем partials ИЗ ДИРЕКТОРИИ ШАБЛОНА
        await registerTemplatePartials(templateName, config.source.templates);

        // 2. Читаем и парсим шаблон
        const templateContent = await fs.readFile(templatePath, 'utf8');
        const directives = parseDirectives(templateContent);
        const template = compileTemplate(templateContent);

        // 3. Обрабатываем директивы
        if (directives.some(d => d.command === 'paginate')) {
            const paginateDirective = directives.find(d => d.command === 'paginate');
            const csrTemplate = paginateDirective.args.csrTemplate;

            // 4. Копируем CSR-шаблон с ПРАВИЛЬНЫМ ИМЕНЕМ ШАБЛОНА
            await copyCsrTemplate(templateName, csrTemplate, outputDir);

            // 5. Обрабатываем пагинацию
            await handlePagination(directives, template, data, outputDir, itemName, templateName);
        } else {
            // Обычный рендеринг
            const html = template(data);
            const outputPath = path.join(outputDir, `${itemName}.html`);
            await safeMkdir(path.dirname(outputPath));
            await atomicWrite(outputPath, html);
            logger.info(`✅ Rendered single page: ${itemName}.html`);
        }

        return true;
    } catch (err) {
        logger.error(`❌ Failed to render template: ${templatePath}`, {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

/**
 * Обработка пагинации с правильным контекстом
 */
async function handlePagination(directives, template, data, outputDir, itemName, templateName) {
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

        // Определяем путь: output/html/catalog/books/page/1.html
        const pageDir = path.join(outputDir, itemName, 'page');
        const pagePath = path.join(pageDir, `${page.pageNumber}.html`);

        await safeMkdir(pageDir);
        await atomicWrite(pagePath, html);

        logger.debug(`✅ Rendered page ${page.pageNumber}/${page.totalPages} for ${templateName}/${itemName}`);
    }

    logger.info(`✨ Rendered ${pages.length} pages for ${templateName}/${itemName}`);
}
// core/renderer.js
/**
 * Генерация клиентских артефактов (данные для CSR)
 * @param {string} dataPath - Путь к исходному JSON-файлу
 * @param {string} templateName - Имя шаблона (catalog)
 * @param {string} itemName - Имя элемента (books)
 */
export async function generateClientArtifacts(dataPath, templateName, itemName) {
    try {
        // 1. Читаем данные
        const dataContent = await fs.readFile(dataPath, 'utf8');

        // 2. Формируем пути с использованием ПРАВИЛЬНЫХ параметров
        const outputDataDir = path.join(config.output.data, templateName);
        const outputDataPath = path.join(outputDataDir, `${itemName}.json`);

        // 3. Создаем директории
        await safeMkdir(outputDataDir);

        // 4. Сохраняем данные с форматированием
        const parsedData = JSON.parse(dataContent);
        const formattedData = JSON.stringify(parsedData, null, 2);
        await atomicWrite(outputDataPath, formattedData);

        logger.info(`✅ Generated client data for ${templateName}/${itemName}.json`);

        return true;
    } catch (err) {
        logger.error(`❌ Failed to generate client artifacts for ${templateName}/${itemName}`, {
            error: err.message,
            stack: err.stack,
            dataPath,
            templateName,
            itemName
        });
        throw err;
    }
}