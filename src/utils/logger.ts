// RN 的 __DEV__ 在 Node/Jest 中不存在，使用 typeof 守卫避免 ReferenceError。
declare const __DEV__: boolean;
declare const process: { env?: Record<string, string | undefined> };

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minimumLevel: LogLevel = 'debug';
let enabledOverride: boolean | null = null;

/** 开发期输出、生产静默；测试可通过 setLogEnabled 关闭。 */
function isEnabled(): boolean {
  if (enabledOverride !== null) {
    return enabledOverride;
  }
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

function write(level: LogLevel, args: unknown[]): void {
  if (!isEnabled() || LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel]) {
    return;
  }
  const prefix = `[eReader:${level}]`;
  const consoleRef = console as unknown as Record<string, (...items: unknown[]) => void>;
  const sink = consoleRef[level === 'debug' ? 'log' : level] ?? consoleRef.log;
  sink(prefix, ...args);
}

export const logger = {
  setEnabled(value: boolean): void {
    enabledOverride = value;
  },
  setLevel(level: LogLevel): void {
    minimumLevel = level;
  },
  debug(...args: unknown[]): void {
    write('debug', args);
  },
  info(...args: unknown[]): void {
    write('info', args);
  },
  warn(...args: unknown[]): void {
    write('warn', args);
  },
  error(...args: unknown[]): void {
    write('error', args);
  },
};
