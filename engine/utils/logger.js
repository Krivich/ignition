import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultLogFile = path.join(__dirname, '..', 'logs', 'ignition.log');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: defaultLogFile })
  ]
});

// Logging error handling
logger.on('error', (err) => {
  console.error('Logger error:', err);
});

export default logger;
