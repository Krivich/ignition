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
import { resetManifest, getManifest } from './helpers.js';
import { deriveInitialState } from '../utils/deriveInitialState.js';
import { analyzeTemplate } from './compiler.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasIgnitionAttributes(html) {
  return /data-ignition-(block|data|depends|binding|on|class|attr-)/.test(html);
}

function buildDataUrl(layout, dataset) {
  return `/data/${layout}/${dataset}.json`;
}

function injectDataPreload(html, layout, dataset) {
  if (!hasIgnitionAttributes(html)) return html;
  const dataUrl = buildDataUrl(layout, dataset);
  const link = `<link rel="preload" href="${dataUrl}" as="fetch" crossorigin="anonymous">`;
  const headClose = html.indexOf('</head>');
  if (headClose === -1) return link + html;
  return html.slice(0, headClose) + link + html.slice(headClose);
}

/**
 * Wrap partial content with reflection attributes for auto-blocks.
 * 
 * @param {string} content - Partial template content
 * @param {string} blockName - Block name (layout/partial)
 * @param {string} dataPath - Data path for the block
 * @param {string} depends - Dependencies for the block
 * @returns {string} - Wrapped template content
 */
function wrapPartialWithReflection(content, blockName, dataPath, depends) {
  // Use the existing {{#block}} helper to wrap the partial
  // This ensures consistency with explicit blocks
  return `{{#block name="${blockName}" data="${dataPath}" depends="${depends}"}}${content}{{/block}}`;
}

/**
 * Inject reflection attributes for auto-blocks based on compiler analysis.
 * 
 * @param {string} html - Rendered HTML
 * @param {object} analysis - Compiler analysis result
 * @param {string} layout - Layout name
 * @returns {string} - HTML with injected attributes
 */
function injectReflection(html, analysis, layout) {
  if (analysis.hasNoblock || analysis.partials.length === 0) {
    return html;
  }
  
  // Reflection attributes are already injected via wrapPartialWithReflection
  // This function is now a no-op, but kept for future post-processing if needed
  return html;
}

// Initialize Handlebars
await registerCorePartials();
registerHelpers();

export async function renderTemplate(templatePath, data, outputDir, dataset, layout) {
    try {
        // 1. Read template
        const templateContent = await fs.readFile(templatePath, 'utf8');

        // 2. Analyze template for v2 reflection
        const analysis = analyzeTemplate(templateContent);
        
        // 3. Detect pagination
        const paginationConfig = detectPaginationInTemplate(templateContent);

        // 4. Read and register ALL partials from templates
        await registerAllTemplatePartials(config.source.templates, analysis);

        // 5. Compile template
        const template = Handlebars.compile(templateContent);

        // 6. Process pagination
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
            const { layout: _l, dataset: _d, ...pureData } = data;
            resetManifest();
            const html = template({
                ...data,
                initialData: 'IGNITION_INITIAL_DATA_PLACEHOLDER__',
                manifest: 'IGNITION_MANIFEST_PLACEHOLDER__'
            });
            
            // Inject reflection attributes for auto-blocks
            let finalHtml = injectReflection(html, analysis, layout);
            
            const renderedManifest = JSON.stringify(getManifest());
            const derivedInitialData = JSON.stringify(deriveInitialState(finalHtml, pureData, analysis))
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e')
                .replace(/&/g, '\\u0026')
                .replace(/'/g, '\\u0027');
            finalHtml = finalHtml
                .split('IGNITION_INITIAL_DATA_PLACEHOLDER__').join(derivedInitialData)
                .split('IGNITION_MANIFEST_PLACEHOLDER__').join(renderedManifest);
            finalHtml = injectDataPreload(finalHtml, layout, dataset);
            const outputPath = path.join(outputDir, `${dataset}.html`);
            await safeMkdir(path.dirname(outputPath));
            await atomicWrite(outputPath, finalHtml);
            logger.info(`✅ Rendered single page: ${dataset}.html`);
        }

        // 7. Copy CSR template (if exists)
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

async function registerAllTemplatePartials(templatesDir, analysis = null) {
    try {
        const templateDirs = await fs.readdir(templatesDir, { withFileTypes: true });

        for (const dir of templateDirs) {
            if (dir.isDirectory()) {
                const partialsDir = path.join(templatesDir, dir.name);
                const files = await fs.readdir(partialsDir, { withFileTypes: true });

                for (const file of files) {
                    if (file.isFile() && file.name.endsWith('.hbs')) {
                        const partialName = path.basename(file.name, '.hbs');
                        const fullName = `${dir.name}/${partialName}`;
                        const content = await fs.readFile(path.join(partialsDir, file.name), 'utf8');
                        
                        // Check if this partial should be auto-wrapped
                        const partialAnalysis = analysis?.partials?.find(p => p.partialName === fullName);
                        
                        if (partialAnalysis && !analysis.hasNoblock) {
                            // Wrap partial with reflection attributes
                            const wrappedContent = wrapPartialWithReflection(
                                content, 
                                fullName, 
                                partialAnalysis.dataPath, 
                                partialAnalysis.depends
                            );
                            Handlebars.registerPartial(fullName, wrappedContent);
                            logger.debug(`✅ Registered auto-block partial: ${fullName}`);
                        } else {
                            Handlebars.registerPartial(fullName, content);
                            logger.debug(`✅ Registered partial: ${fullName}`);
                        }
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
        await atomicWrite(pagePath, injectDataPreload(html, layout, dataset));
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

export { parseHandlebarsParams } from '../utils/parseParams.js';