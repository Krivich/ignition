import Handlebars from 'handlebars';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import deepGet from '../utils/deepGet.js';
import config from '../config/default.js';
import {parseHandlebarsParams} from "./renderer.js";

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
    Handlebars.registerHelper('times', function (n, block) {
        let accum = '';
        for (let i = 1; i <= n; ++i) {
            accum += block.fn(i);
        }
        return accum;
    });

    Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
        switch (operator) {
            case '==':
                return (v1 == v2) ? options.fn(this) : options.inverse(this);
            case '===':
                return (v1 === v2) ? options.fn(this) : options.inverse(this);
            case '!=':
                return (v1 != v2) ? options.fn(this) : options.inverse(this);
            case '!==':
                return (v1 !== v2) ? options.fn(this) : options.inverse(this);
            case '<':
                return (v1 < v2) ? options.fn(this) : options.inverse(this);
            case '<=':
                return (v1 <= v2) ? options.fn(this) : options.inverse(this);
            case '>':
                return (v1 > v2) ? options.fn(this) : options.inverse(this);
            case '>=':
                return (v1 >= v2) ? options.fn(this) : options.inverse(this);
            case '&&':
                return (v1 && v2) ? options.fn(this) : options.inverse(this);
            case '||':
                return (v1 || v2) ? options.fn(this) : options.inverse(this);
            default:
                return options.inverse(this);
        }
    });

    Handlebars.registerHelper('get', function (obj, path) {
        return deepGet(obj, path);
    });


    Handlebars.registerHelper('concat', function () {
        return Array.prototype.slice.call(arguments, 0, -1).join('');
    });

    Handlebars.registerHelper('declineWord', function (count, one, two, five) {
        count = Math.abs(count) % 100;
        const n1 = count % 10;
        if (count > 10 && count < 20) return five;
        if (n1 > 1 && n1 < 5) return two;
        if (n1 === 1) return one;
        return five;
    });

    Handlebars.registerHelper('json', function(context) {
        return new Handlebars.SafeString(JSON.stringify(context));
    });

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
