# TypeScript 编码规范

本文档从代码重构实践中提炼，适用于中小型 TypeScript 项目。

---

## 一、文件结构规范

### 1.1 文件行数限制

| 类型 | 行数限制 | 说明 |
|-----|---------|-----|
| 入口文件 | ≤ 300 行 | 插件入口、模块导出 |
| 业务模块 | ≤ 450 行 | 超过则需拆分 |
| 工具函数 | ≤ 150 行 | 单一职责 |

**拆分原则：**
- 按职责拆分，而非按文件类型
- 同一模块的紧密相关代码放在一起
- 公共依赖下沉，业务逻辑上浮

### 1.2 目录结构

```
src/
├── main.ts                 # 插件入口（精简）
├── constants.ts            # 全局常量
├── api/                    # 外部 API 封装
├── auth/                   # 认证模块
├── settings/               # 设置模块
│   ├── index.ts            # 导出
│   ├── types.ts            # 类型定义
│   ├── defaults.ts         # 默认值
│   └── settings-tab.ts     # UI 面板
├── sync/                   # 核心业务模块
│   ├── sync-engine.ts      # 调度入口
│   ├── sync-upload.ts      # 上传逻辑
│   ├── sync-download.ts    # 下载逻辑
│   ├── sync-utils.ts       # 工具函数
│   └── ...
├── ui/                     # UI 组件
└── utils/                  # 通用工具
    ├── index.ts
    ├── encoding.ts
    └── logger.ts
```

---

## 二、命名常量规范

### 2.1 禁止神仙数字

```typescript
// ❌ 错误：神仙数字
setTimeout(() => this.sync(), 2000);
if (processedFiles % 5 === 0) await sleep(500);
const sizeLimitBytes = fileSizeLimit * 1024 * 1024;

// ✅ 正确：使用命名常量
const STARTUP_SYNC_DELAY_MS = 2000;
const BATCH_PAUSE_THRESHOLD = 5;
const BATCH_PAUSE_MS = 500;
const MB_TO_BYTES = 1024 * 1024;

setTimeout(() => this.sync(), STARTUP_SYNC_DELAY_MS);
if (processedFiles % BATCH_PAUSE_THRESHOLD === 0) await sleep(BATCH_PAUSE_MS);
const sizeLimitBytes = fileSizeLimit * MB_TO_BYTES;
```

### 2.2 常量命名规范

| 类型 | 命名风格 | 示例 |
|-----|---------|-----|
| 时间常量 | `*_MS`、`*_S` | `STARTUP_SYNC_DELAY_MS` |
| 数量阈值 | `MAX_*`、`*_THRESHOLD` | `MAX_UPLOAD_RETRIES` |
| 转换常量 | `*_TO_*` | `MB_TO_BYTES` |
| 配置常量 | `DEFAULT_*` | `DEFAULT_BRANCH` |
| 列表常量 | `*_LIST`、复数形式 | `TEMP_FILE_NAMES`、`BINARY_EXTENSIONS` |

### 2.3 常量文件结构

```typescript
// src/constants.ts

// ============================================
// 同步相关常量
// ============================================

/** 启动时同步延迟（毫秒） */
export const STARTUP_SYNC_DELAY_MS = 2000;

/** 文件变更 debounce 延迟（毫秒） */
export const FILE_CHANGE_DEBOUNCE_MS = 300;

// ============================================
// API 相关常量
// ============================================

/** 上传文件最大重试次数 */
export const MAX_UPLOAD_RETRIES = 3;
```

---

## 三、函数设计规范

### 3.1 单一职责原则

```typescript
// ❌ 错误：一个函数承担多个职责
async bidirectionalSync(): Promise<SyncResult> {
    // 获取远程文件
    // 拉取远程变更
    // 检查冲突
    // 删除本地文件
    // 推送本地变更
}

// ✅ 正确：拆分为多个私有方法
async bidirectionalSync(): Promise<SyncResult> {
    const remoteFileMap = await this.fetchRemoteFiles();
    await this.pullRemoteChanges(remoteFileMap);

    if (this.hasConflicts()) return this.handleConflicts();

    await this.deleteLocalFiles(remoteFileMap);
    await this.pushLocalChanges(remoteFileMap);

    return this.buildResult();
}
```

### 3.2 提取验证方法

```typescript
// ❌ 错误：多个早期返回检查
handleFileChange(file: TFile) {
    if (this.syncEngine.isDownloading) return;
    if (!this.settings.autoSync) return;
    if (!this.isAuthenticated) return;
    if (this.syncEngine.shouldExcludeFile(file.path)) return;
    if (!this.syncEngine.isFileSizeOk(file.stat.size)) return;
    if (isTempFileName(file.basename)) return;
    // ...
}

// ✅ 正确：提取验证方法
handleFileChange(file: TFile) {
    if (!this.shouldSyncFile(file)) return;

    if (this.isSyncing) {
        this.deferOperation('modify', file);
        return;
    }
    this.addToSyncQueue(file);
}

private shouldSyncFile(file: TFile): boolean {
    return !this.syncEngine.isDownloading &&
           this.settings.autoSync &&
           this.isAuthenticated &&
           !this.syncEngine.shouldExcludeFile(file.path) &&
           this.syncEngine.isFileSizeOk(file.stat.size) &&
           !isTempFileName(file.basename);
}
```

### 3.3 工厂函数模式

```typescript
// ❌ 错误：重复的对象初始化
const result: SyncResult = {
    success: true,
    uploadedFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
    deletedFiles: 0,
    errors: []
};

// ✅ 正确：使用工厂函数
export function createSyncResult(): SyncResult {
    return {
        success: true,
        uploadedFiles: 0,
        skippedFiles: 0,
        errorFiles: 0,
        deletedFiles: 0,
        errors: []
    };
}

export function createErrorResult(message: string): SyncResult {
    return { ...createSyncResult(), success: false, errors: [message] };
}

// 使用
const result = createSyncResult();
const error = createErrorResult('Not authenticated');
```

---

## 四、日志规范

### 4.1 统一日志工具

```typescript
// ❌ 错误：直接使用 console
console.log('Plugin loaded');
console.error('Failed to upload:', error);
console.warn('File not found');

// ✅ 正确：使用统一日志工具
import { logger } from '../utils/logger';

logger.info('Plugin loaded');
logger.error('Failed to upload:', error);
logger.warn('File not found');
logger.debug('Processing files:', count);  // 仅开发环境
```

### 4.2 日志级别使用

| 级别 | 用途 | 生产环境 |
|-----|-----|---------|
| `debug` | 调试信息、流程跟踪 | 不显示 |
| `info` | 重要操作、状态变更 | 显示 |
| `warn` | 非预期但可恢复的情况 | 显示 |
| `error` | 错误、异常 | 显示 |

### 4.3 日志内容规范

```typescript
// ✅ 包含上下文信息
logger.debug('Default branch:', defaultBranch);
logger.error('Failed to upload file:', path, error);
logger.info('Authenticated as:', username);

// ❌ 过于简单，缺少上下文
logger.debug(defaultBranch);
logger.error(error);
```

---

## 五、工具函数规范

### 5.1 统一工具模块

```typescript
// ❌ 错误：工具函数分散在各处
// sync-engine.ts
private arrayBufferToBase64(buffer: ArrayBuffer): string { ... }

// conflict-modal.ts
base64ToString(base64: string): string { ... }

// ✅ 正确：统一到 utils 模块
// src/utils/encoding.ts
export function arrayBufferToBase64(buffer: ArrayBuffer): string { ... }
export function base64ToArrayBuffer(base64: string): ArrayBuffer { ... }
export function base64ToString(base64: string): string { ... }

// src/utils/index.ts
export { arrayBufferToBase64, base64ToArrayBuffer, base64ToString } from './encoding';
export { logger } from './logger';

// 使用
import { arrayBufferToBase64, logger } from '../utils';
```

### 5.2 工具函数命名

| 类型 | 命名风格 | 示例 |
|-----|---------|-----|
| 转换函数 | `xToY` | `arrayBufferToBase64` |
| 检查函数 | `isX`、`hasX`、`shouldX` | `isTempFileName`、`hasConflicts` |
| 获取函数 | `getX` | `getFileNameFromPath` |
| 创建函数 | `createX` | `createSyncResult` |

---

## 六、类型定义规范

### 6.1 类型文件组织

```typescript
// types.ts - 模块类型定义

/** 同步状态存储 */
export interface SyncStateData {
    lastSyncTime: string;
    lastCommitSha: string;
    fileStates: Record<string, FileSyncStateData>;
}

/** 文件同步状态 */
export interface FileSyncStateData {
    localPath: string;
    remoteSha: string;
    localModified: string;
    status: 'synced' | 'pending' | 'conflict';
}
```

### 6.2 避免内联类型

```typescript
// ❌ 错误：内联类型难以复用
async uploadFile(options: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
}): Promise<{ sha: string; path: string } | null>

// ✅ 正确：使用命名类型
export interface UploadFileOptions {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
}

export interface UploadResult {
    sha: string;
    path: string;
}

async uploadFile(options: UploadFileOptions): Promise<UploadResult | null>
```

---

## 七、错误处理规范

### 7.1 预期错误静默处理

```typescript
// ✅ 404 是预期行为，不记录错误
async getFileSha(path: string): Promise<string | null> {
    const response = await fetch(url);

    if (response.status === 404) {
        return null;  // 文件不存在是预期行为
    }

    if (!response.ok) {
        logger.error('Failed to get file SHA:', path, response.status);
    }
    return null;
}
```

### 7.2 错误信息包含上下文

```typescript
// ❌ 错误：缺少上下文
catch (error) {
    logger.error(error);
}

// ✅ 正确：包含操作上下文
catch (error) {
    logger.error('Failed to upload file:', file.path, error);
}
```

---

## 八、重构检查清单

在重构前，检查以下问题：

- [ ] 文件是否超过 450 行？
- [ ] 是否存在神仙数字？
- [ ] 函数是否有超过 5 个早期返回？
- [ ] 是否有重复的对象初始化代码？
- [ ] 是否直接使用 `console.log/error/warn`？
- [ ] 工具函数是否分散在多个文件？
- [ ] 是否有内联类型定义？