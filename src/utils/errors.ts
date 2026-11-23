import {
  ERROR_MESSAGES,
  ErrorCode,
} from '../constants/errorCodes';

/**
 * 应用统一错误对象（共享知识第 6 条）。
 * 所有 service 失败必须抛 AppError，UI 只能通过 toUserMessage 展示。
 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message && message.trim().length > 0 ? message : ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    // 兼容 ES5 target 下 instanceof 判断。
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** 返回面向用户的可读文案。 */
  toUserMessage(): string {
    return this.message && this.message.length > 0
      ? this.message
      : ERROR_MESSAGES[this.code];
  }
}

/**
 * 将任意异常归一为 AppError，杜绝裸字符串与未知异常泄漏到 UI。
 * 未知错误默认按 E_PARSE_FAILED 处理，调用方可传入更贴切的 code。
 */
export function asAppError(
  error: unknown,
  fallbackCode: ErrorCode = ErrorCode.E_PARSE_FAILED,
): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message);
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return new AppError(fallbackCode, error);
  }
  return new AppError(fallbackCode);
}

/** UI 统一入口：任何异常都能得到可读文案。 */
export function toUserMessage(error: unknown): string {
  return asAppError(error).toUserMessage();
}
