import winston from 'winston';
import config from '../config/default.js';

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
    new winston.transports.File({ filename: config.logging.file })
  ]
});

// Обработка ошибок логирования
logger.on('error', (err) => {
  console.error('Logger error:', err);
});

export default logger;
