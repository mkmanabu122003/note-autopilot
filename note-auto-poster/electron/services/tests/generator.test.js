// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { Generator, buildArticlePath, SYSTEM_PROMPT } = await import('../generator.js');

describe('generator', () => {
  let tmpDir;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildArticlePath', () => {
    it('正しいパスを生成する', () => {
      const result = buildArticlePath('tokken', 'AIの基礎');
      expect(result).toContain(path.join('accounts', 'tokken', 'articles'));
      expect(result).toContain('AIの基礎');
      expect(result).toMatch(/\.md$/);
    });

    it('ファイル名の不正文字を置換する', () => {
      const result = buildArticlePath('tokken', 'test/file?name');
      expect(result).not.toMatch(/\/file/);
      expect(result).not.toContain('?');
    });
  });

  describe('SYSTEM_PROMPT', () => {
    it('日本語のシステムプロンプトを含む', () => {
      expect(SYSTEM_PROMPT).toContain('プロのコンテンツライター');
      expect(SYSTEM_PROMPT).toContain('note');
      expect(SYSTEM_PROMPT).toContain('3000〜5000文字');
    });
  });

  describe('Generator class', () => {
    it('Generator がインスタンス化できる', () => {
      const gen = new Generator();
      expect(gen).toBeDefined();
      expect(gen.sm).toBeDefined();
    }, 15000);

    it('run メソッドが存在する', () => {
      const gen = new Generator();
      expect(typeof gen.run).toBe('function');
    }, 15000);

    it('runSingle メソッドが存在する', () => {
      const gen = new Generator();
      expect(typeof gen.runSingle).toBe('function');
    }, 15000);
  });
});
