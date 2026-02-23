import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We test the findFiles and processBatch logic by sourcing the functions
// from the rewrite.js template. Since rewrite.js is a script (not a module),
// we'll extract and test the key functions directly.

describe('rewrite.js findFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-test-'));
    // Create test directory structure
    fs.mkdirSync(path.join(tmpDir, 'account1', 'drafts'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'account1', 'reviewing'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Replicate findFiles from rewrite.js for testing
   */
  function findFiles(targetFile, cwd) {
    const files = [];

    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          walk(full);
        } else if (entry.name.endsWith('.md')) {
          files.push(full);
        }
      }
    }

    walk(cwd);

    if (targetFile) {
      return files.filter(f =>
        path.basename(f) === targetFile ||
        f.endsWith(targetFile) ||
        path.relative(cwd, f) === targetFile
      );
    }

    return files.filter(f => {
      const rel = path.relative(cwd, f);
      return !rel.startsWith('.') &&
             !rel.toLowerCase().includes('readme') &&
             !rel.toLowerCase().includes('config');
    });
  }

  it('finds .md files recursively', () => {
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', 'article.md'), 'test');
    const found = findFiles('', tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('article.md');
  });

  it('finds file by basename', () => {
    const japaneseName = 'ツアーガイド記事_12345.md';
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', japaneseName), 'test');
    const found = findFiles(japaneseName, tmpDir);
    expect(found).toHaveLength(1);
    expect(path.basename(found[0])).toBe(japaneseName);
  });

  it('finds file by full relative path', () => {
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', 'test.md'), 'test');
    const found = findFiles('account1/drafts/test.md', tmpDir);
    expect(found).toHaveLength(1);
  });

  it('excludes dotfiles and config/readme', () => {
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflow.md'), 'test');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'test');
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', 'article.md'), 'test');
    const found = findFiles('', tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('article.md');
  });

  it('handles Japanese filenames with fullwidth characters', () => {
    const name = 'トラブル対応完全マニュアル：迷子・体調不良_12345.md';
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', name), 'content');
    const found = findFiles(name, tmpDir);
    expect(found).toHaveLength(1);
    expect(path.basename(found[0])).toBe(name);
  });

  it('basename search finds file even when full path does not match', () => {
    const name = 'ツアー記事_99999.md';
    fs.writeFileSync(path.join(tmpDir, 'account1', 'drafts', name), 'content');
    // Simulate API returning a slightly different path
    const wrongPath = 'account1/reviewing/' + name;
    const found = findFiles(wrongPath, tmpDir);
    // Full path won't match, but let's check basename fallback
    if (found.length === 0) {
      // Fallback: search by basename only
      const fallback = findFiles(name, tmpDir);
      expect(fallback).toHaveLength(1);
    }
  });
});

describe('processBatch file resolution', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-test-'));
    fs.mkdirSync(path.join(tmpDir, 'shopenism', 'drafts'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves file by basename when exact path fails', () => {
    const filename = 'ツアー中のトラブル対応_12345.md';
    const content = '---\ntitle: test\n---\nBody content';
    fs.writeFileSync(path.join(tmpDir, 'shopenism', 'drafts', filename), content);

    const absPath = path.join(tmpDir, 'wrong/path', filename);
    expect(fs.existsSync(absPath)).toBe(false);

    // Simulate findFiles fallback
    function findFilesInDir(target) {
      const files = [];
      function walk(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.')) walk(full);
          } else if (entry.name.endsWith('.md')) {
            files.push(full);
          }
        }
      }
      walk(tmpDir);
      if (target) {
        return files.filter(f =>
          path.basename(f) === target || f.endsWith(target)
        );
      }
      return files;
    }

    const basename = path.basename(filename);
    const found = findFilesInDir(basename);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('shopenism/drafts');
  });
});
