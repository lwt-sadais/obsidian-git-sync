# Obsidian Git Sync

[![GitHub release](https://img.shields.io/github/release/lwt-sadais/obsidian-git-sync.svg)](https://github.com/lwt-sadais/obsidian-git-sync/releases)
[![GitHub license](https://img.shields.io/github/license/lwt-sadais/obsidian-git-sync.svg)](https://github.com/lwt-sadais/obsidian-git-sync/blob/main/LICENSE)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%483699&label=downloads&query=%24%5B%22obsidian-git-sync%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://github.com/lwt-sadais/obsidian-git-sync)

通过 GitHub 私有仓库实现多设备知识库同步的 Obsidian 插件。

## 为什么选择 Git Sync？

| 特性 | Git Sync | iCloud | Obsidian Sync |
|------|----------|--------|---------------|
| 价格 | 🆓 免费 | 💰 付费 | 💰 付费 |
| 多平台支持 | ✅ 全平台 | ⚠️ Apple 生态 | ✅ 全平台 |
| 私有存储 | ✅ GitHub 私有仓库 | ✅ | ✅ |
| 版本历史 | ✅ Git 历史 | ⚠️ 有限 | ✅ |
| 单文件同步 | ✅ 增量同步 | ❌ | ✅ |

## 功能特性

- 🆓 **完全免费** - 使用 GitHub 私有仓库，无需额外付费
- 🔄 **双向同步** - 本地 ↔ 远程自动同步
- ⚡ **实时同步** - 文件创建、修改、删除、移动自动触发
- 🔀 **增量同步** - 基于 SHA 对比，只同步变更文件
- 🛡️ **智能冲突检测** - 自动检测并提示冲突
- 📱 **移动端支持** - 不依赖 Git 命令，支持 iOS/Android
- 🌐 **国际化** - 支持中文、英文

## 安装

### 方式 1：BRAT 插件安装（推荐）

[BRAT](https://github.com/TfTHacker/obsidian42-brat) 可以帮助你安装尚未发布到社区市场的插件。

1. 安装 **BRAT** 插件（在社区插件市场搜索 "BRAT"）
2. 打开 Obsidian 设置 → BRAT → **Add Beta plugin**
3. 输入仓库地址：`lwt-sadais/obsidian-git-sync`
4. 点击 **Add Plugin**
5. 在设置 → 社区插件中启用 **Git Sync**

### 方式 2：手动安装

1. 前往 [Releases](https://github.com/lwt-sadais/obsidian-git-sync/releases) 页面下载最新版本
2. 下载 `main.js`、`manifest.json`、`styles.css` 三个文件
3. 在你的 Vault 中创建目录：`.obsidian/plugins/obsidian-git-sync/`
4. 将下载的文件复制到该目录
5. 重启 Obsidian
6. 在设置 → 社区插件中启用 **Git Sync**

### 方式 3：让 AI 帮你安装

如果你正在使用 Claude、ChatGPT 等 AI 助手，可以让 AI 帮你完成安装：

**复制以下提示词发送给 AI：**

```
帮我安装 Obsidian Git Sync 插件，步骤如下：

1. 从 GitHub 下载插件文件：
   - 仓库地址：https://github.com/lwt-sadais/obsidian-git-sync
   - 需要下载：main.js、manifest.json、styles.css
   - 最新版本：https://github.com/lwt-sadais/obsidian-git-sync/releases/latest

2. 我的 Obsidian Vault 路径是：[请填写你的 Vault 路径]

3. 请帮我：
   - 创建 .obsidian/plugins/obsidian-git-sync/ 目录
   - 下载并保存这三个文件到该目录
   - 给出后续在 Obsidian 中启用的步骤说明
```

## 使用方法

### 第一步：创建 GitHub Token

1. 点击链接：https://github.com/settings/tokens/new?scopes=repo,user
2. 设置 Token 名称（如 `obsidian-sync`）
3. 选择过期时间（建议 90 天或 No expiration）
4. 确保勾选 `repo` 和 `user` 权限
5. 点击 **Generate token**
6. ⚠️ **立即复制 Token**，页面关闭后无法再次查看

### 第二步：配置插件

1. 打开 Obsidian 设置 → **Git Sync**
2. 粘贴 GitHub Token，点击 **Login**
3. 登录成功后，选择：
   - **创建新仓库** - 输入仓库名，插件会自动创建私有仓库
   - **选择已有仓库** - 从你的私有仓库列表中选择

### 第三步：开始同步

配置完成后，插件会自动同步文件变更。

## 命令说明

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| Sync now | - | 双向同步（推荐日常使用） |
| Pull from remote | - | 从远程拉取，以远程为准 |
| Push to remote | - | 推送到远程，以本地为准 |

可以在 Obsidian 命令面板（Ctrl/Cmd + P）中搜索命令，也可以设置快捷键。

## 状态栏

状态栏显示当前同步状态：

| 图标 | 状态 | 说明 |
|:----:|:----:|------|
| ✓ | Synced | 已同步，无待处理变更 |
| ⟳ | Syncing | 同步中，请稍候 |
| ⏳ | Pending | 有待同步的文件 |
| ✗ | Error | 同步失败，请检查网络或 Token |
| ⚡ | Conflict | 存在冲突，需要手动处理 |
| ○ | Offline | 离线或未登录 |

**点击状态栏**可以打开快捷菜单，执行同步操作或查看上次同步时间。

## 同步机制

### 双向同步流程

```
┌─────────────────────────────────────────────────────────┐
│                    Sync Now 执行流程                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  第一步：拉取远程变更                                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ • 下载远程新增/修改的文件                            ││
│  │ • 删除本地已不存在的文件（远程已删除）                ││
│  │ • 检测冲突并暂停同步                                 ││
│  └─────────────────────────────────────────────────────┘│
│                         ↓                                │
│  第二步：推送本地变更                                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ • 扫描本地所有文件                                   ││
│  │ • 对比远程 SHA，上传需要同步的文件                    ││
│  │ • 跳过已同步的文件                                   ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 自动同步触发

| 本地操作 | 同步动作 |
|----------|----------|
| 创建文件 | 自动上传到 GitHub |
| 修改文件 | 自动更新到 GitHub |
| 删除文件 | 自动从 GitHub 删除 |
| 移动/重命名 | 删除旧路径 + 上传新路径 |

### 临时文件过滤

以下文件名会被自动过滤，不同步到 GitHub：
- `未命名`、`未命名-1`...
- `Untitled`、`Untitled-1`...
- `New note`、`新笔记`

### 默认排除规则

以下路径默认不同步：
- `.obsidian/plugins/obsidian-git-sync/` - 插件自身
- `.obsidian/workspace.json` - 工作区状态
- `.obsidian/workspace-mobile.json` - 移动端工作区
- `.trash/` - 回收站

## 设置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| Auto Sync | 开启 | 文件变更时自动同步 |
| Sync Interval | 10 分钟 | 定时同步间隔 |
| File Size Limit | 100 MB | 文件大小限制（GitHub 限制） |
| Sync on Startup | 开启 | 启动时自动同步 |

## 常见问题

### Q: Token 过期了怎么办？

A: 重新生成 Token 并在插件设置中重新登录。

### Q: 同步失败怎么办？

A: 检查以下项：
1. 网络连接是否正常
2. Token 是否过期
3. 仓库是否存在
4. 查看 Obsidian 开发者控制台（Ctrl/Cmd + Shift + I）的错误信息

### Q: 如何在多台设备使用？

A: 在每台设备上安装插件，使用同一个 Token 和同一个仓库即可。建议：
- 第一台设备：创建仓库并全量同步
- 其他设备：选择已有仓库，执行 Pull from remote

### Q: 文件大小超过 100MB 怎么办？

A: GitHub 单文件限制 100MB，建议：
1. 使用压缩文件
2. 或将该文件类型添加到排除规则

## 开发

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/lwt-sadais/obsidian-git-sync.git
cd obsidian-git-sync

# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

### 推荐开发流程

1. 创建测试 Vault（⚠️ 不要在主 Vault 中开发）
2. 将仓库克隆到 `.obsidian/plugins/obsidian-git-sync/`
3. 安装 [Hot-Reload 插件](https://github.com/pjeby/hot-reload) 实现热更新
4. 运行 `npm run dev`
5. 修改代码后自动重载

### 项目结构

```
obsidian-git-sync/
├── src/
│   ├── main.ts              # 插件入口、事件监听
│   ├── auth/                # 认证模块
│   ├── sync/                # 同步引擎
│   ├── api/                 # GitHub API 封装
│   └── ui/                  # UI 组件
├── docs/                    # 文档
├── manifest.json            # 插件配置
└── styles.css               # 样式
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT License](LICENSE)

## 致谢

- [Obsidian](https://obsidian.md/) - 优秀的知识管理工具
- [Octokit](https://github.com/octokit/octokit.js) - GitHub API 客户端