import Handlebars from 'handlebars';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import config from '../config/default.js';
import { parseHandlebarsParams } from '../utils/parseParams.js';
import { registerHelpersWith } from './helpers.js';

export async function registerCorePartials() {
    try {
        const partialsDir = config.corePartials;
        const files = await fs.readdir(partialsDir);

        for (const file of files) {
            if (file.endsWith('.hbs')) {
                const name = path.basename(file, '.hbs');
                const content = await fs.readFile(path.join(partialsDir, file), 'utf8');
                Handlebars.registerPartial(`core/${name}`, content);
                logger.debug(`Registered core partial: ${name}`);
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            logger.error('Failed to register core partials', {error: err.message});
            throw err;
        }
    }
}

export function registerHelpers() {
    registerHelpersWith(Handlebars);
    logger.debug('Registered Handlebars helpers');
}

export function compileTemplate(templateContent) {
    // Remove ignition directives before compilation
    const cleanTemplate = templateContent.replace(/{{!--\s*ignition:[\s\S]*?--}}/g, '');
    return Handlebars.compile(cleanTemplate);
}

export function detectPaginationInTemplate(templateContent) {
    // Look for calls to our system partial
    const paginationRegex = /{{>\s*ignition\/pagination\s+([^}]*)}}/g;
    const matches = [];
    let match;

    while ((match = paginationRegex.exec(templateContent)) !== null) {
        const paramsStr = match[1].trim();
        const params = parseHandlebarsParams(paramsStr);
        matches.push({
            enabled: true,
            collection: params.collection || 'items',
            perPage: params.perPage || 10,
            template: params.template || 'pagination',
            fullTemplatePath: params.fullTemplatePath || 'page'
        });
    }

    return matches.length > 0 ? matches[0] : { enabled: false };
}
