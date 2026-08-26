// core/renderer.js
import path from 'path';
import fs from 'fs/promises'; // <-- Adding import
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars'; // <-- EXPLICIT IMPORT
import logger from '../utils/logger.js';
import {
    safeMkdir,
    atomicWrite,
    safeReadJson
} from '../utils/fs.js';
import {
    detectPaginationInTemplate,
    registerCorePartials,
    registerHelpers
} from './handlebars.js';
import { paginateCollection, preparePageData } from './pagination.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Handlebars
await registerCorePartials();
registerHelpers();

export async function renderTemplate(templatePath, data, outputDir, dataset, layout) {
    try {
        // 1. Read template
        const templateContent = await fs.readFile(templatePath, 'utf8');

        // 2. Detect pagination
        const paginationConfig = detectPaginationInTemplate(templateContent);

        // 3. Read and register ALL partials from templates
        await registerAllTemplatePartials(config.source.templates);

        // 4. Compile template
        const template = Handlebars.compile(templateContent);

        // 5. Process pagination
        if (paginationConfig.enabled) {
            await handlePagination(
                paginationConfig,
                template,
                data,
                outputDir,
                dataset,
                layout
            );
        } else {
            // Regular rendering
            const html = template({ ...data, layout, dataset, initialData: JSON.stringify(data) });
            const outputPath = path.join(outputDir, `${dataset}.html`);
            await safeMkdir(path.dirname(outputPath));
            await atomicWrite(outputPath, html);
            logger.info(`✅ Rendered single page: ${dataset}.html`);
        }

        // 6. Copy CSR template (if exists)
        if (paginationConfig.enabled) {
            await copyCsrTemplate(layout, paginationConfig.template);
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

async function registerAllTemplatePartials(templatesDir) {
    try {
        const templateDirs = await fs.readdir(templatesDir, { withFileTypes: true });

        for (const dir of templateDirs) {
            if (dir.isDirectory()) {
                const partialsDir = path.join(templatesDir, dir.name);
                const files = await fs.readdir(partialsDir, { withFileTypes: true });

                for (const file of files) {
                    if (file.isFile() && file.name.endsWith('.hbs')) {
                        const partialName = path.basename(file.name, '.hbs');
                        const content = await fs.readFile(path.join(partialsDir, file.name), 'utf8');
                        Handlebars.registerPartial(`${dir.name}/${partialName}`, content);
                        logger.debug(`✅ Registered partial: ${dir.name}/${partialName}`);
                    }
                }
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            logger.error('❌ Failed to register template partials', { error: err.message });
        }
    }
}

async function copyCsrTemplate(layout, pageTemplate) {
    const sourcePath = path.join(config.source.templates, layout, `${pageTemplate}.hbs`);
    const outputPath = path.join(config.output.templates, layout, `${pageTemplate}.hbs`);

    try {
        await fs.access(sourcePath);
        await safeMkdir(path.dirname(outputPath));
        await fs.copyFile(sourcePath, outputPath);

        logger.info(`✅ Copied CSR template: ${layout}.hbs`);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`⚠️ CSR template not found: ${sourcePath}`);
            // Create a stub for development
            await safeMkdir(path.dirname(outputPath));
            await fs.writeFile(outputPath, '<div class="pagination-placeholder">Pagination template not found</div>');
            return false;
        }
        throw err;
    }
}

/**
 * Process pagination with correct context
 */
async function handlePagination(config, template, data, outputDir, dataset, layout) {
    const pages = paginateCollection(data, config.collection, config.perPage);

    for (const page of pages) {
        // Form config for client-side pagination
        const paginationConfigForClient = {
            collection: config.collection,
            perPage: config.perPage,
            currentPage: page.pageNumber,
            totalPages: page.totalPages,
            dataUrl: `/data/${layout}/${dataset}.json`, // Correct path to data
            templateUrl: `/templates/${config.fullTemplatePath}.hbs` // Full path to template!
        };

        const pageData = {
            ...data,
            layout,
            dataset,
            pagination: preparePageData(data, page, page.pageNumber).pagination,
            paginationConfig: paginationConfigForClient // Pass to template
        };

        const html = template(pageData);
        const pagePath = path.join(outputDir, dataset, 'page', `${page.pageNumber}.html`);
        await safeMkdir(path.dirname(pagePath));
        await atomicWrite(pagePath, html);
    }
}

// core/renderer.js
/**
 * Generate client artifacts (data for CSR)
 * @param {string} dataPath - Path to source JSON file
 * @param {string} layout - Template name (catalog)
 * @param {string} dataset - Dataset name (books)
 */
export async function generateClientArtifacts(dataPath, layout, dataset) {
    try {
        // 1. Read data
        const dataContent = await fs.readFile(dataPath, 'utf8');

        // 2. Form paths using CORRECT parameters
        const outputDataDir = path.join(config.output.data, layout);
        const outputDataPath = path.join(outputDataDir, `${dataset}.json`);

        // 3. Create directories
        await safeMkdir(outputDataDir);

        // 4. Save data with formatting
        const parsedData = JSON.parse(dataContent);
        const formattedData = JSON.stringify(parsedData, null, 2);
        await atomicWrite(outputDataPath, formattedData);

        logger.info(`✅ Generated client data for ${layout}/${dataset}.json`);

        return true;
    } catch (err) {
        logger.error(`❌ Failed to generate client artifacts for ${layout}/${dataset}`, {
            error: err.message,
            stack: err.stack,
            dataPath,
            layout,
            dataset
        });
        throw err;
    }
}

export function parseHandlebarsParams(paramsStr) {
    const params = {};
    const paramRegex = /(\w+)=(?:"([^"]+)"|(\w+))/g;
    let match;

    while ((match = paramRegex.exec(paramsStr)) !== null) {
        const key = match[1];
        const value = match[2] || match[3];
        params[key] = isNaN(value) ? value : Number(value);
    }

    // Support for new format with fallback for backward compatibility
    if (params.pageTemplate) {
        params.fullTemplatePath = params.pageTemplate; // "catalog/page"
        params.templateName = params.pageTemplate.split('/')[0]; // "catalog"
        params.template = params.pageTemplate.split('/')[1]; // "page"
    } else {
        // Old format (for backward compatibility)
        params.template = params.template || 'pagination';
        params.fullTemplatePath = `${params.layout || 'catalog'}/${params.template}`;
        params.templateName = params.layout || 'catalog';
    }

    return params;
}