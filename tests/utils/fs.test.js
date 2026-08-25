import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import os from 'os';
import { renderTemplate, generateClientArtifacts, parseHandlebarsParams } from '../../engine/core/renderer.js';
import { paginateCollection, preparePageData } from '../../engine/core/pagination.js';
import { generateSitemap } from '../../engine/core/sitemap.js';
import { safeMkdir, atomicWrite, safeReadJson, cleanupTmp } from '../../engine/utils/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

describe('fs utilities', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ignition-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('safeMkdir', () => {
    it('creates directory recursively', async () => {
      const dir = path.join(tmpDir, 'a', 'b', 'c');
      await safeMkdir(dir, tmpDir);
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('does not throw if directory already exists', async () => {
      const dir = path.join(tmpDir, 'existing');
      await fs.mkdir(dir, { recursive: true });
      await expect(safeMkdir(dir, tmpDir)).resolves.not.toThrow();
    });
  });

  describe('atomicWrite', () => {
    it('writes file atomically', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await atomicWrite(filePath, 'hello world');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('hello world');
    });

    it('no leftover .tmp files after write', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await atomicWrite(filePath, 'content');
      const files = await fs.readdir(tmpDir);
      expect(files.filter(f => f.includes('.tmp'))).toHaveLength(0);
    });

    it('overwrites existing file atomically', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await atomicWrite(filePath, 'first');
      await atomicWrite(filePath, 'second');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('second');
    });
  });

  describe('safeReadJson', () => {
    it('reads and parses valid JSON', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      await fs.writeFile(filePath, JSON.stringify({ key: 'value' }));
      const data = await safeReadJson(filePath);
      expect(data).toEqual({ key: 'value' });
    });

    it('throws on invalid JSON', async () => {
      const filePath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filePath, 'not json');
      await expect(safeReadJson(filePath)).rejects.toThrow('Invalid JSON');
    });

    it('throws on missing file', async () => {
      await expect(safeReadJson(path.join(tmpDir, 'missing.json'))).rejects.toThrow();
    });
  });

  describe('cleanupTmp', () => {
    it('removes .tmp files', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.tmp'), '');
      await fs.writeFile(path.join(tmpDir, 'b.tmp'), '');
      await fs.writeFile(path.join(tmpDir, 'c.txt'), '');
      await cleanupTmp(tmpDir);
      const files = await fs.readdir(tmpDir);
      expect(files).toEqual(['c.txt']);
    });

    it('does not throw if directory does not exist', async () => {
      const missingDir = path.join(tmpDir, 'nope');
      await expect(cleanupTmp(missingDir)).resolves.not.toThrow();
    });
  });
});

describe('parseHandlebarsParams (renderer)', () => {
  it('parses full pagination parameters', () => {
    const result = parseHandlebarsParams(
      'collection="products" perPage=10 pageTemplate="catalog/page" layout=layout dataset=dataset'
    );
    expect(result.collection).toBe('products');
    expect(result.perPage).toBe(10);
    expect(result.pageTemplate).toBe('catalog/page');
    expect(result.fullTemplatePath).toBe('catalog/page');
    expect(result.templateName).toBe('catalog');
    expect(result.template).toBe('page');
  });
});
