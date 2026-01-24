import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..'); // Корень проекта

/**
 * Безопасное создание директории
 * @param {string} dirPath - Путь к директории
 * @throws {Error} Если путь выходит за пределы проекта
 */
export async function safeMkdir(dirPath, rootPath = projectRoot) {
  // Если путь уже абсолютный, используем его напрямую
  const resolvedPath = path.isAbsolute(dirPath) ? dirPath : path.resolve(rootPath, dirPath);

  // Проверяем, что путь не выходит за пределы rootPath, если это не абсолютный путь
  if (!path.isAbsolute(dirPath) && !resolvedPath.startsWith(path.resolve(rootPath))) {
    throw new Error(`Path traversal detected: ${dirPath}`);
  }

  try {
    await fs.mkdir(resolvedPath, { recursive: true });
    logger.debug(`Created directory: ${resolvedPath}`);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Атомарная запись файла
 * @param {string} filePath - Путь к файлу
 * @param {string|Buffer} content - Содержимое
 * @param {object} options - Дополнительные опции
 */
export async function atomicWrite(filePath, content, options = {}) {
  const tmpPath = `${filePath}.tmp.${Date.now()}`;

  try {
    await fs.writeFile(tmpPath, content, options);
    await fs.rename(tmpPath, filePath);
    logger.debug(`Atomically wrote file: ${filePath}`);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Безопасное чтение JSON
 * @param {string} filePath - Путь к JSON-файлу
 * @returns {object} Разпарсенные данные
 */
export async function safeReadJson(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    logger.error(`Failed to read JSON file: ${filePath}`, { error: err.message });
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
}

/**
 * Очистка временных файлов при старте
 * @param {string} tmpDir - Директория временных файлов
 */
export async function cleanupTmp(tmpDir) {
  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    const cleanupPromises = entries.map(async (entry) => {
      const fullPath = path.join(tmpDir, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else if (entry.name.endsWith('.tmp')) {
        await fs.unlink(fullPath);
      }
    });

    await Promise.all(cleanupPromises);
    logger.info(`Cleaned up temporary files in ${tmpDir}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error('Failed to cleanup temp files', { error: err.message });
      throw err;
    }
  }
}
