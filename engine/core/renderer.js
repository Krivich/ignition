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
import { deriveInitialState, needsRuntime } from '../utils/deriveInitialState.js';
import { fineCoverage } from './fineRegistry.js';
import { analyzeTemplate, applyAutobindings, applyProjections } from './compiler.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildDataUrl(layout, dataset) {
  return `/data/${layout}/${dataset}.json`;
}

function injectDataPreload(html, layout, dataset, live = false) {
  if (!live) return html;
  const dataUrl = buildDataUrl(layout, dataset);
  const link = `<link rel="preload" href="${dataUrl}" as="fetch" crossorigin="anonymous">`;
  const headClose = html.indexOf('</head>');
  if (headClose === -1) return link + html;
  return html.slice(0, headClose) + link + html.slice(headClose);
}

/**
 * Escape a JSON string for safe inlining into a <script> tag.
 */
function jsonSafe(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027');
}

/**
 * Auto-inject the client-side boot: initial state, registered templates and the
 * reactivity runtime. This lets the developer declare reactivity declaratively
 * (pagination, bindings, a controller) without writing runtime <script> tags by
 * hand. Templates that already embed the scripts are left untouched.
 *
 * @param {string} html - Rendered page HTML
 * @param {{initialData: object, templates: object}} payload - Boot data
 * @param {boolean} gate - Whether the page needs the runtime at all
 * @param {boolean} isPagination - Whether the page is a real pagination page
 */
function injectClientBoot(html, payload, gate, isPagination = false) {
  if (!gate) return html;

  const insert = (h, tags) => {
    const bodyClose = h.lastIndexOf('</body>');
    const block = '\n' + tags.join('\n') + '\n';
    if (bodyClose === -1) return h + block;
    return h.slice(0, bodyClose) + block + h.slice(bodyClose);
  };

  // Reactive boot (state + templates + runtime). Live pages re-render blocks
  // client-side, which needs the Handlebars compiler — provided self-hosted by
  // the engine so the developer never writes a manual <script> tag.
  if (payload && !/ignition-runtime\.js/.test(html) && !/__IGNITION_INITIAL_DATA__/.test(html)) {
    html = insert(html, [
      `<script src="/assets/handlebars.min.js"></script>`,
      `<script>window.__IGNITION_INITIAL_DATA__ = ${jsonSafe(payload.initialData)};</script>`,
      `<script>window.__IGNITION_TEMPLATES__ = ${jsonSafe(payload.templates)};</script>`,
      `<script src="/assets/ignition-runtime.js"></script>`
    ]);
  }

  // System mini-controller: a real pagination page needs its script too.
  // (Gated on the layout actually declaring {{> ignition/pagination}}, not on a
  // raw substring — that would false-positive on the pagination.hbs source that
  // ships inside __IGNITION_TEMPLATES__ of unrelated reactive pages.)
  if (isPagination && !/ignition-pagination\.js/.test(html)) {
    html = insert(html, [`<script src="/assets/ignition-pagination.js" defer></script>`]);
  }

  return html;
}

/**
 * Whether an external controller exists for this layout/dataset. Presence of a
 * controller means "someone can change the model" → the page needs the runtime.
 */
async function hasController(layout, dataset) {
  const controllersDir = config.source.controllers;
  const candidates = [
    path.join(controllersDir, `${layout}.js`),
    path.join(controllersDir, layout, `${dataset}.js`)
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return true;
    } catch (_) { /* next */ }
  }
  return false;
}

/**
 * Auto-inject the external page controller: the "someone who changes the model".
 * The renderer looks for input/controllers/{layout}.js (or {layout}/{dataset}.js),
 * copies it into output/assets/controllers/ and links it on the page. A controller
 * is an explicit declaration that the page is alive → it also forces the runtime.
 *
 * @param {string} html   - Rendered page HTML
 * @param {string} layout - Layout name
 * @param {string} dataset- Dataset name
 */
async function injectController(html, layout, dataset, outputDir) {
  const controllersDir = config.source.controllers;
  const candidates = [
    path.join(controllersDir, `${layout}.js`),
    path.join(controllersDir, layout, `${dataset}.js`)
  ];

  let found = null;
  for (const c of candidates) {
    try {
      await fs.access(c);
      found = c;
      break;
    } catch (_) { /* not found, try next */ }
  }
  if (!found) return html;

  const destDir = path.join(config.output.assets, 'controllers');
  const dest = path.join(destDir, path.basename(found));
  await safeMkdir(destDir);
  await fs.copyFile(found, dest);

  const tag = `<script src="/assets/controllers/${path.basename(dest)}"></script>`;
  if (html.includes(tag)) return html;

  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) return html + '\n' + tag;
  return html.slice(0, bodyClose) + '\n' + tag + '\n' + html.slice(bodyClose);
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
function wrapPartialWithReflection(content, blockName, dataPath, depends, fine = null) {
  // Use the existing {{#block}} helper to wrap the partial.
  // `autoblock=1` tells the helper to render the inline raw body with the
  // current context (and record the manifest slice from the root), instead of
  // resolving the partial by name again (which is THIS same wrapper and would
  // recurse). Explicit {{#block}} helpers in layouts don't set this flag.
  // `fine` lists depends paths fully covered by @p stickers - the runtime
  // block skips re-renders for leaf-only changes under them.
  const fineAttr = fine && fine.size ? ` fine="${[...fine].join(', ')}"` : '';
  return `{{#block name="${blockName}" data="${dataPath}" depends="${depends}"${fineAttr} autoblock=1}}${content}{{/block}}`;
}

// Initialize Handlebars
await registerCorePartials();
registerHelpers();

/**
 * Per-template-context cache. All downstream derivations from a layout's raw
 * source — AST analysis, pagination config, autobinding/projection transforms
 * and the compiled Handlebars function — depend only on the template content,
 * NOT on the data. Recomputing them for every page wastes the two most
 * expensive steps (Handlebars.parse + Handlebars.compile). We key by the raw
 * source string so any edit to a layout invalidates exactly that entry.
 *
 * @type {Map<string, {analysis: object, paginationConfig: object,
 *        transformed: string, projected: string, compile: Function}>}
 */
const templateContextCache = new Map();

function getTemplateContext(templateContent, templateName = 'template') {
  let cached = templateContextCache.get(templateContent);
  if (cached) return cached;
  const analysis = analyzeTemplate(templateContent);
  const paginationConfig = detectPaginationInTemplate(templateContent);
  const transformed = applyAutobindings(templateContent);
  const projected = applyProjections(transformed, {
    onDiag: (items) => warnLostFineGrained(templateName, items),
  });
  cached = {
    analysis,
    paginationConfig,
    transformed,
    projected,
    compile: Handlebars.compile(projected)
  };
  templateContextCache.set(templateContent, cached);
  return cached;
}

export function _clearTemplateCache() { templateContextCache.clear(); }

// Build-time diagnostics: a list that lost fine-grained updates degrades to a
// full block re-render on every cell change - tell the author why, once per
// template (the projection is cached, so this fires on first compile).
function warnLostFineGrained(templateName, items) {
  for (const { collection, reasons } of items) {
    logger.warn(
      `⚠️ ${templateName}: list "${collection}" re-renders its block on every cell change — ${reasons.join('; ')}. ` +
      `Keep the row body to simple fields ({{field}}) for fine-grained point updates.`
    );
  }
}

export async function renderTemplate(templatePath, data, outputDir, dataset, layout) {
    try {
        // 1. Read template
        const templateContent = await fs.readFile(templatePath, 'utf8');

        // 2-6. Analyze, transform and compile — cached by template content
        const ctx = getTemplateContext(templateContent, path.basename(templatePath, '.hbs'));
        const { analysis, paginationConfig, compile: template } = ctx;

        // 4. Read and register ALL partials from templates (also collect raw
        //    sources before Handlebars compiles them). Result is cached and
        //    only refreshed when the templates directory changes.
        const templateSources = await registerAllTemplatePartials(config.source.templates, analysis);

        // 6. Process pagination
        if (paginationConfig.enabled) {
            await handlePagination(
                paginationConfig,
                template,
                data,
                outputDir,
                dataset,
                layout,
                templateSources
            );
        } else {
            // Regular rendering
            const { layout: _l, dataset: _d, ...pureData } = data;
            resetManifest();
            const html = template({
                ...data,
                layout,
                dataset,
                initialData: 'IGNITION_INITIAL_DATA_PLACEHOLDER__',
                manifest: 'IGNITION_MANIFEST_PLACEHOLDER__',
                templates: 'IGNITION_TEMPLATES_PLACEHOLDER__'
            });
            
            // Inject reflection attributes for auto-blocks
            let finalHtml = html;
            
            // v2: an external controller is "someone who can change the model".
            // It may read arbitrary dataset branches, so when a controller is
            // present the full dataset is inlined (REACTIVITY §7) and the page
            // is live (runtime + preload injected).
            const liveController = await hasController(layout, dataset);

            const renderedManifest = jsonSafe(getManifest());
            const templatesJson = jsonSafe(templateSources);

            // Compute the derived client state once (was computed twice — once
            // for inlining, once for the boot payload — with identical inputs).
            // Placeholders in the html carry no data-ignition-* markers, so the
            // extraction result is the same whether run before or after the
            // substitution below.
            const initialData = deriveInitialState(finalHtml, pureData, analysis, liveController);
            const derivedInitialData = jsonSafe(initialData);

            // Single-pass placeholder substitution: swap all three markers
            // (plus the empty-template fallback) in one sweep instead of four
            // full-string scans.
            finalHtml = finalHtml.replace(
                /IGNITION_INITIAL_DATA_PLACEHOLDER__|IGNITION_MANIFEST_PLACEHOLDER__|IGNITION_TEMPLATES_PLACEHOLDER__|"__IGNITION_TEMPLATES__": null/g,
                (m) => m === 'IGNITION_INITIAL_DATA_PLACEHOLDER__'
                    ? derivedInitialData
                    : m === 'IGNITION_MANIFEST_PLACEHOLDER__'
                        ? renderedManifest
                        : templatesJson
            );

            // v2: preload the full dataset only for live (interactive) pages —
            // a page that no one can change doesn't need the data fetched early.
            const liveRuntime = needsRuntime(finalHtml, analysis);
            const live = liveRuntime || liveController;
            logger.debug(`[ignition] Page ${dataset}.html — liveness: ${live ? 'live → runtime+preload injected' : 'static → runtime omitted'} (detected runtime: ${liveRuntime}, external controller: ${liveController})`);
            finalHtml = injectDataPreload(finalHtml, layout, dataset, live);
            // v2: auto-inject the runtime when the page is reactive, so the
            // developer does not hand-write the runtime <script> tags.
            finalHtml = injectClientBoot(finalHtml, {
                initialData,
                templates: templateSources
            }, live, paginationConfig.enabled);
            // External controller (explicit "live page" declaration).
            finalHtml = await injectController(finalHtml, layout, dataset, outputDir);
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

let autoBlockCache = new Map();

/**
 * Compute a cheap signature for the templates tree: the sorted list of every
 * .hbs file's name + mtime + size. Stat calls are metadata-only I/O, far cheaper
 * than re-reading + transforming + re-registering every partial on each render.
 * @returns {Promise<string>}
 */
async function templatesSignature(templatesDir) {
  const entries = [];
  const walk = async (dir, prefix) => {
    let list;
    try {
      list = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const e of list) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, `${prefix}${e.name}/`);
      } else if (e.isFile() && e.name.endsWith('.hbs')) {
        const s = await fs.stat(full);
        entries.push(`${prefix}${e.name}:${s.mtimeMs}:${s.size}`);
      }
    }
  };
  await walk(templatesDir, '');
  return entries.sort().join('|');
}

const partialCache = new Map();

/**
 * Compute the set of auto-block partials deterministically across EVERY layout.
 * A partial used as `{{> some/partial <data>}}` in any layout becomes an
 * auto-block. Everything is decided globally (scanned once and cached) so that
 * concurrent rendering tasks all register the same partials the same way — the
 * per-layout analysis based decision is racy on the shared global Handlebars.
 *
 * @returns {Promise<Map<string, {dataPath: string, depends: string}>>}
 */
async function detectAutoBlocks(templatesDir, signature) {
    if (autoBlockCache.has(signature)) return autoBlockCache.get(signature);
    const map = new Map();
    const templateDirs = await fs.readdir(templatesDir, { withFileTypes: true });
    for (const entry of templateDirs) {
        if (!entry.isFile() || !entry.name.endsWith('.hbs')) continue;
        const src = await fs.readFile(path.join(templatesDir, entry.name), 'utf8');
        const a = analyzeTemplate(src);
        if (a.hasNoblock) continue;
        for (const p of a.partials) {
            if (!map.has(p.partialName)) {
                map.set(p.partialName, { dataPath: p.dataPath, depends: p.depends });
            }
        }
    }
    autoBlockCache.set(signature, map);
    return map;
}

async function registerAllTemplatePartials(templatesDir, analysis = null) {
    const signature = await templatesSignature(templatesDir);
    // Fast path: templates unchanged → reuse cached sources + already-registered
    // partials, avoiding the full read/transform/register pass on every render.
    // The promise itself is cached so concurrent render tasks (queue
    // concurrency > 1) share one registration pass instead of duplicating it
    // (and duplicating its build-time warnings).
    const cached = partialCache.get(signature);
    if (cached) return cached;
    const inFlight = registerAllTemplatePartialsUncached(templatesDir, signature);
    partialCache.set(signature, inFlight);
    return inFlight;
}

async function registerAllTemplatePartialsUncached(templatesDir, signature) {
    const sources = {};
    try {
        const autoBlocks = await detectAutoBlocks(templatesDir, signature);
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
                        // Autobindings + row-scoped @p projections. Partials get
                        // scopedOnly: their call-site context may be shifted, so
                        // top-level stickers would resolve against wrong paths.
                        let fine = null;
                        const transformedContent = applyProjections(applyAutobindings(content), {
                            scopedOnly: true,
                            onFine: (s) => { fine = s; },
                            onDiag: (items) => warnLostFineGrained(fullName, items),
                        });

                        // Deterministic auto-block decision (global, not per-task)
                        const autoBlock = autoBlocks.get(fullName);

                        if (autoBlock) {
                            // Wrap partial with reflection attributes for SSR block rendering
                            const wrappedContent = wrapPartialWithReflection(
                                transformedContent,
                                fullName,
                                autoBlock.dataPath,
                                autoBlock.depends,
                                fine
                            );
                            Handlebars.registerPartial(fullName, wrappedContent);
                            // Client re-render uses the raw partial source (without the SSR wrapper)
                            sources[fullName] = transformedContent;
                            logger.debug(`✅ Registered auto-block partial: ${fullName}`);
                        } else {
                            Handlebars.registerPartial(fullName, transformedContent);
                            sources[fullName] = transformedContent;
                            logger.debug(`✅ Registered partial: ${fullName}`);
                        }
                        // Expose the partial's fine-grained coverage to the {{#block}}
                        // helper - explicit block calls in layouts resolve the partial
                        // by name and stamp data-ignition-fine from here.
                        if (fine && fine.size) {
                            fineCoverage.set(fullName, fine);
                        } else {
                            fineCoverage.delete(fullName);
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
    return sources;
}

async function copyCsrTemplate(layout, pageTemplate) {
    if (!pageTemplate || /[.]{2}/.test(String(pageTemplate)) || /[^a-zA-Z0-9\-_]/.test(String(pageTemplate))) {
        logger.warn(`⚠️ Invalid pageTemplate value for CSR copy: ${pageTemplate}`);
        return false;
    }
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
async function handlePagination(config, template, data, outputDir, dataset, layout, templateSources) {
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
        let pageFile = injectDataPreload(html, layout, dataset, true);
        // v2: pagination is a system mini-controller — it changes the page in
        // the model, so it needs the runtime. Auto-inject full dataset (so the
        // client can slice the whole collection) + registered templates.
        let pageHtml = injectClientBoot(pageFile, {
            initialData: data,
            templates: templateSources
        }, true, true);
        // External controller (explicit "live page" declaration).
        pageHtml = await injectController(pageHtml, layout, dataset, outputDir);
        const pagePath = path.join(outputDir, dataset, 'page', `${page.pageNumber}.html`);
        await safeMkdir(path.dirname(pagePath));
        await atomicWrite(pagePath, pageHtml);
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

        // 4. Save data with formatting (skip rewrite if the target already
        //    contains identical bytes — avoids needless disk churn in watch mode)
        const parsedData = JSON.parse(dataContent);
        const formattedData = JSON.stringify(parsedData, null, 2);
        let unchanged = false;
        try {
            const existing = await fs.readFile(outputDataPath, 'utf8');
            unchanged = existing === formattedData;
        } catch (_) { /* target missing → must write */ }
        if (!unchanged) {
            await atomicWrite(outputDataPath, formattedData);
        }

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