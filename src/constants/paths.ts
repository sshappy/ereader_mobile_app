/**
 * 目录常量（共享知识第 2 条）。
 *
 * BOOKS_DIR / COVERS_DIR / TTS_CACHE_DIR 是"路径模板"，仅用于文档与日志展示；
 * 业务代码必须通过 IFileService.getBooksDir() / getCacheDir() 或 writeCacheFile()
 * 获取真实绝对路径，禁止在业务代码里硬编码 RNFS 路径。
 */
export const DOCUMENT_ROOT_TOKEN = '${DocumentDirectoryPath}';
export const CACHES_ROOT_TOKEN = '${CachesDirectoryPath}';

export const BOOKS_DIR_NAME = 'books';
export const COVERS_DIR_NAME = 'covers';
export const TTS_CACHE_DIR_NAME = 'tts';

export const BOOKS_DIR = `${DOCUMENT_ROOT_TOKEN}/${BOOKS_DIR_NAME}`;
export const COVERS_DIR = `${DOCUMENT_ROOT_TOKEN}/${COVERS_DIR_NAME}`;
export const TTS_CACHE_DIR = `${CACHES_ROOT_TOKEN}/${TTS_CACHE_DIR_NAME}`;

/** 拼接真实目录，供 IFileService 适配器内部使用（自动去掉尾部斜杠）。 */
export function joinPath(root: string, name: string): string {
  return `${root.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;
}

/** 从路径中取文件名（兼容 / 与 \\，供去重与缓存命名使用）。 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** 生成安全的缓存文件名，避免路径穿越与外部 URI 字符。 */
export function safeFileName(name: string): string {
  const clean = baseName(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.length > 0 ? clean : 'file';
}
