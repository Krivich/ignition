import fs from 'fs/promises';
import crypto from 'crypto';
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
 * Check that a path is contained within a given root directory.
 * @param {string} filePath - The path to validate
 * @param {string} rootDir - The root directory it must be inside
 * @throws {Error} If the path escapes the root
 */
export function assertInsideRoot(filePath, rootDir) {
    const resolved = path.resolve(rootDir, path.relative(rootDir, path.resolve(filePath)));
    const safeRoot = path.resolve(rootDir);
    if (!resolved.startsWith(safeRoot + path.sep) && resolved !== safeRoot) {
        throw new Error(`Path escapes root directory: ${filePath} is outside ${rootDir}`);
    }
}

/**
 * Atomic file write using a crypto-random temp name and exclusive open.
 * @param {string} filePath - Path to file
 * @param {string|Buffer} content - Content
 * @param {object} options - Additional options
 */
export async function atomicWrite(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const tmpPath = path.join(dir, `.tmp.${path.basename(filePath)}.${randomSuffix}`);

  try {
    await fs.writeFile(tmpPath, content, { ...options, flag: 'wx' });
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
 * Cleanup temporary files on startup.
 * Only deletes files ending in .tmp and subdirectories that look like
 * temporary build artefacts (contain only .tmp files), to prevent
 * accidental deletion of real directories.
 * @param {string} tmpDir - Temporary files directory
 */
export async function cleanupTmp(tmpDir) {
  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    const cleanupPromises = entries.map(async (entry) => {
      const fullPath = path.join(tmpDir, entry.name);
      if (entry.isDirectory()) {
        // Only delete if all children are .tmp files (build artefacts)
        const children = await fs.readdir(fullPath);
        const allTmp = children.every(c => c.endsWith('.tmp') || c === '.tmp');
        if (allTmp) {
          await fs.rm(fullPath, { recursive: true, force: true });
        }
      } else if (entry.name.endsWith('.tmp') || entry.name.startsWith('.tmp.')) {
        await fs.unlink(fullPath).catch(() => {});
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
