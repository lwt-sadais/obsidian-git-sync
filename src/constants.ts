/**
 * 全局常量定义
 */

// ============================================
// 同步相关常量
// ============================================

/** 启动时同步延迟（毫秒） */
export const STARTUP_SYNC_DELAY_MS = 2000;

/** 文件变更 debounce 延迟（毫秒） */
export const FILE_CHANGE_DEBOUNCE_MS = 300;

/** 批量处理暂停阈值（文件数） */
export const BATCH_PAUSE_THRESHOLD = 5;

/** 批量处理暂停时间（毫秒） */
export const BATCH_PAUSE_MS = 500;

/** MB 转字节乘数 */
export const MB_TO_BYTES = 1024 * 1024;

// ============================================
// API 相关常量
// ============================================

/** 上传文件最大重试次数 */
export const MAX_UPLOAD_RETRIES = 3;

/** 删除文件最大重试次数 */
export const MAX_DELETE_RETRIES = 2;

/** 获取仓库列表每页数量 */
export const REPO_PAGE_SIZE = 100;

/** 重试等待基数（毫秒） */
export const RETRY_WAIT_BASE_MS = 1000;

/** 删除重试等待时间（毫秒） */
export const DELETE_RETRY_WAIT_MS = 500;

// ============================================
// GitHub 相关常量
// ============================================

/** 默认分支名称 */
export const DEFAULT_BRANCH = 'main';

/** GitHub API 版本 */
export const GITHUB_API_VERSION = '2022-11-28';

/** GitHub 文件大小限制（MB） */
export const GITHUB_FILE_SIZE_LIMIT_MB = 100;

// ============================================
// 文件过滤常量
// ============================================

/** 临时文件名列表（新建笔记时的默认名称，需要过滤） */
export const TEMP_FILE_NAMES = [
    '未命名',
    'Untitled',
    'Untitled-1',
    'Untitled-2',
    'Untitled-3',
    'New note',
    '新笔记'
] as const;

/** 默认排除路径 */
export const DEFAULT_EXCLUDED_PATHS = [
    '.obsidian/plugins/obsidian-git-sync/',
    '.obsidian/workspace.json',
    '.obsidian/workspace-mobile.json',
    '.trash/'
] as const;

/** 远程仓库默认跳过的文件 */
export const REMOTE_SKIP_FILES = [
    '.gitignore',
    'README.md',
    'LICENSE'
] as const;

/** 远程仓库默认跳过的目录前缀 */
export const REMOTE_SKIP_PREFIXES = [
    '.git/'
] as const;

// ============================================
// 二进制文件扩展名
// ============================================

/** 二进制文件扩展名列表 */
export const BINARY_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
    '.pdf', '.zip', '.tar', '.gz', '.rar',
    '.mp3', '.mp4', '.wav', '.avi', '.mov',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
] as const;