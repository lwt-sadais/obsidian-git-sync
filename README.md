# Obsidian Git Sync

通过 GitHub 私有仓库实现多设备知识库同步的 Obsidian 插件。

## 功能特性

- 免费的多设备同步（通过 GitHub 私有仓库）
- Token 认证方式
- **双向同步**：本地 ↔ 远程自动同步
- **实时同步**：文件创建、修改、删除、移动自动触发
- **智能冲突检测**：自动检测并提示冲突
- **增量同步**：基于 SHA 对比，只同步变更文件
- 支持排除规则和文件大小限制
- 支持移动端（不依赖 Git 命令）

## 使用方法

### 1. 创建 GitHub Token

1. 访问 https://github.com/settings/tokens/new?scopes=repo,user
2. 设置 Token 名称和过期时间
3. 勾选 `repo` 和 `user` 权限
4. 点击「Generate token」并复制生成的 Token

### 2. 配置插件

1. 在 Obsidian 中打开设置 → Git Sync
2. 粘贴 GitHub Token，点击「Login」
3. 创建新仓库或选择已有仓库

### 3. 开始同步

插件会自动同步文件变更。你也可以手动触发：

| 命令 | 说明 |
|------|------|
| `Sync now` | 双向同步（推荐日常使用） |
| `Pull from remote` | 全量下载，以远程为准 |
| `Push to remote` | 全量上传，以本地为准 |

### 4. 状态栏

状态栏显示当前同步状态：

| 图标 | 状态 | 说明 |
|------|------|------|
| ✓ | Synced | 已同步 |
| ⟳ | Syncing | 同步中 |
| ⏳ | Pending | 待同步 |
| ✗ | Error | 同步失败 |
| ⚡ | Conflict | 存在冲突 |
| ○ | Offline | 离线/未登录 |

点击状态栏可打开快捷菜单。

## 同步机制

### 双向同步流程

```
┌─────────────────────────────────────────────────────┐
│                 bidirectionalSync()                  │
├─────────────────────────────────────────────────────┤
│  第一步：拉取远程变更                                │
│  - 下载远程新增/修改的文件                           │
│  - 删除本地已不存在的文件（远程已删除）              │
│  - 检测冲突并暂停                                   │
├─────────────────────────────────────────────────────┤
│  第二步：推送本地变更                                │
│  - 扫描本地所有文件                                 │
│  - 对比远程 SHA，上传需要同步的文件                  │
│  - 跳过已同步的文件                                 │
└─────────────────────────────────────────────────────┘
```

### 自动同步

- **文件创建**：自动上传到 GitHub
- **文件修改**：自动更新到 GitHub
- **文件删除**：自动从 GitHub 删除
- **文件移动/重命名**：删除旧路径，上传新路径

### 临时文件过滤

以下文件名会被自动过滤，不同步到 GitHub：
- `未命名`、`未命名-1`...
- `Untitled`、`Untitled-1`...
- `New note`、`新笔记`

### 排除规则

默认排除：
- `.obsidian/plugins/obsidian-git-sync/`（插件自身）
- `.obsidian/workspace.json`（工作区状态）
- `.obsidian/workspace-mobile.json`
- `.trash/`（回收站）

## 开发

### 环境准备

1. 安装 Node.js
2. 克隆仓库
3. 安装依赖：`npm install`

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

### Hot-Reload 开发热更新

为了在开发时自动重载插件，推荐安装 [Hot-Reload 插件](https://github.com/pjeby/hot-reload)：

1. 将本插件克隆到测试 Vault 的 `.obsidian/plugins/obsidian-git-sync/` 目录
2. 在同一 Vault 中安装 Hot-Reload 插件
3. 运行 `npm run dev`
4. 修改代码后会自动重新加载插件

**注意**：永远不要在主 Vault 中开发插件，请创建专门的测试 Vault。

## 项目结构

```
obsidian-git-sync/
├── src/
│   ├── main.ts              # 插件入口、事件监听
│   ├── auth/
│   │   ├── auth-manager.ts  # 认证管理器
│   │   └── encryption.ts    # Token 加密存储
│   ├── sync/
│   │   ├── sync-engine.ts   # 同步引擎（上传、下载、删除）
│   │   └── state-manager.ts # 文件状态管理
│   ├── api/
│   │   ├── github.ts        # GitHub API 封装
│   │   └── types.ts         # 类型定义
│   └── ui/
│       ├── status-bar.ts    # 状态栏管理
│       └── repo-manager.ts  # 仓库管理模态框
├── docs/
│   ├── plans/               # 设计文档
│   └── rules.md             # 开发规则
├── manifest.json            # Obsidian 插件配置
├── package.json
├── tsconfig.json
└── styles.css               # 状态栏样式
```

## 文档

详细设计文档请参阅：[设计文档](docs/plans/2026-03-30-github-sync-design.md)

## 许可证

MIT
