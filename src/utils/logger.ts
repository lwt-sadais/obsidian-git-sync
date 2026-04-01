/**
 * 统一日志工具
 *
 * 支持日志级别控制，生产环境可关闭调试日志
 */

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * 日志配置
 */
interface LoggerConfig {
    /** 当前日志级别 */
    level: LogLevel;
    /** 日志前缀 */
    prefix: string;
}

/**
 * 日志级别权重
 */
const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4
};

/**
 * 日志工具类
 */
class Logger {
    private config: LoggerConfig;

    constructor(config?: Partial<LoggerConfig>) {
        this.config = {
            level: config?.level ?? 'info',
            prefix: config?.prefix ?? '[Git Sync]'
        };
    }

    /**
     * 设置日志级别
     */
    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    /**
     * 获取当前日志级别
     */
    getLevel(): LogLevel {
        return this.config.level;
    }

    /**
     * 检查是否应该输出指定级别的日志
     */
    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[this.config.level];
    }

    /**
     * 格式化日志前缀
     */
    private formatPrefix(): string {
        return this.config.prefix;
    }

    /**
     * 调试日志（仅开发环境）
     */
    debug(message: string, ...args: unknown[]): void {
        if (this.shouldLog('debug')) {
            console.log(`${this.formatPrefix()} ${message}`, ...args);
        }
    }

    /**
     * 信息日志
     */
    info(message: string, ...args: unknown[]): void {
        if (this.shouldLog('info')) {
            console.log(`${this.formatPrefix()} ${message}`, ...args);
        }
    }

    /**
     * 警告日志
     */
    warn(message: string, ...args: unknown[]): void {
        if (this.shouldLog('warn')) {
            console.warn(`${this.formatPrefix()} ${message}`, ...args);
        }
    }

    /**
     * 错误日志
     */
    error(message: string, ...args: unknown[]): void {
        if (this.shouldLog('error')) {
            console.error(`${this.formatPrefix()} ${message}`, ...args);
        }
    }

    /**
     * 分组日志开始
     */
    group(label: string): void {
        if (this.shouldLog('debug')) {
            console.group(`${this.formatPrefix()} ${label}`);
        }
    }

    /**
     * 分组日志结束
     */
    groupEnd(): void {
        if (this.shouldLog('debug')) {
            console.groupEnd();
        }
    }
}

/**
 * 全局日志实例
 *
 * 默认级别为 'info'，生产环境可设置为 'warn' 或 'error'
 */
export const logger = new Logger({ level: 'info' });

/**
 * 创建带自定义前缀的日志实例
 */
export function createLogger(prefix: string): Logger {
    return new Logger({ prefix: `[Git Sync] ${prefix}` });
}