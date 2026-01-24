import Handlebars from 'handlebars';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import deepGet from '../utils/deepGet.js';
import config from '../config/default.js';

// Регистрация системных partials
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
      logger.error('Failed to register core partials', { error: err.message });
      throw err;
    }
  }
}

// Регистрация кастомных хелперов
export function registerHelpers() {
  // Хелпер для итерации по диапазону
  Handlebars.registerHelper('times', function(n, block) {
    let accum = '';
    for (let i = 1; i <= n; ++i) {
      accum += block.fn(i);
    }
    return accum;
  });

  // Условный хелпер для сравнения
  Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
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

  // Хелпер для получения значения по пути
  Handlebars.registerHelper('get', function(obj, path) {
    return deepGet(obj, path);
  });

  logger.debug('Registered Handlebars helpers');
}

// Компиляция шаблона с удалением директив
export function compileTemplate(templateContent) {
  // Удаляем ignition-директивы перед компиляцией
  const cleanTemplate = templateContent.replace(/{{!--\s*ignition:[\s\S]*?--}}/g, '');
  return Handlebars.compile(cleanTemplate);
}

// Извлечение директив из шаблона
export function parseDirectives(templateContent) {
  const directives = [];
  const directiveRegex = /{{!--\s*ignition:([\s\S]*?)\s*--}}/g;
  let match;

  while ((match = directiveRegex.exec(templateContent)) !== null) {
    const directiveStr = match[1].trim();
    const parts = directiveStr.split(/\s+/);
    const command = parts[0];
    const args = {};

    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].split('=');
      if (value) {
        // Убираем кавычки, если есть
        const cleanValue = value.replace(/^["']|["']$/g, '');
        args[key] = isNaN(cleanValue) ? cleanValue : Number(cleanValue);
      }
    }

    directives.push({ command, args });
  }

  return directives;
}
