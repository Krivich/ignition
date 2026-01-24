import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  source: {
    templates: path.join(__dirname, '..', 'input', 'templates'),
    data: path.join(__dirname, '..', 'input', 'data')
  },
  output: {
    html: path.join(__dirname, '..', 'output', 'html'),
    templates: path.join(__dirname, '..', 'output', 'templates'),
    data: path.join(__dirname, '..', 'output', 'data')
  },
  tmpDir: path.join(__dirname, '..', 'tmp'),
  corePartials: path.join(__dirname, '..', 'core', 'partials'),
  pagination: {
    defaultPerPage: 10,
    maxPages: 100
  },
  queue: {
    concurrency: 2,
    debounce: 500
  },
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    file: path.join(__dirname, '..', 'logs', 'ignition.log')
  }
};
