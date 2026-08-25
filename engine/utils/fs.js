import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..'); // Project root

/**
 * Safe directory creation
 * @param {string} dirPath - Path to directory
 * @throws {Error} If path is outside project boundaries
 */
export async function safeMkdir(dirPath, projectRoot = process.cwd()) {
    // Normalize path and remove absolute paths
    const cleanPath = path.normalize(dirPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolvedPath = path.resolve(projectRoot, cleanPath);

    // Check for path traversal
    const safeRoot = path.resolve(projectRoot);
    if (!resolvedPath.startsWith(safeRoot + path.sep)) {
        throw new Error(`Path traversal detected: ${dirPath} → ${resolvedPath}`);
    }

    try {
        await fs.mkdir(resolvedPath, { recursive: true });
        logger.debug(`📁 Created directory: ${resolvedPath}`);
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

/**
 * Atomic file write
 * @param {string} filePath - Path to file
 * @param {string|Buffer} content - Content
 * @param {object} options - Additional options
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
 * Safe JSON reading
 * @param {string} filePath - Path to JSON file
 * @returns {object} Parsed data
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
 * Cleanup temporary files on startup
 * @param {string} tmpDir - Temporary files directory
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
