import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    source: {
        templates: path.join(process.cwd(), 'input', 'templates'),
        data: path.join(process.cwd(), 'input', 'data')
    },
    output: {
        public: path.join(process.cwd(), 'output', 'public'),
        html: path.join(process.cwd(), 'output', 'public'), // html = public
        templates: path.join(process.cwd(), 'output', 'public', 'templates'),
        data: path.join(process.cwd(), 'output', 'public', 'data'),
        assets: path.join(process.cwd(), 'output', 'public', 'assets') // <-- EXPLICIT DEFINITION
    },
    tmpDir: path.join(process.cwd(), 'tmp'),
    domain: 'https://example.com',
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
