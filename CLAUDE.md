# Obsidian Plugin 开发项目

## 项目说明

本项目用于 Obsidian 插件开发学习和实践。

## 文档位置

- Obsidian 插件开发文档：`.claude/Obsidian插件开发文档.md`
- TypeScript 编码规范：`.claude/typescript-编码规范.md`
- 设计文档：`docs/plans/2026-03-30-github-sync-design.md`
- 开发规则：`docs/rules.md`

## 当前项目

**Obsidian Git Sync** - 通过 GitHub 私有仓库实现多设备知识库同步的插件。详见设计文档。

## 开发环境

- Node.js 环境
- TypeScript
- Visual Studio Code（推荐）

## 快速开始

1. 创建测试 Vault（不要在主 Vault 中开发）
2. 克隆示例插件到 `.obsidian/plugins` 目录
3. 运行 `npm install && npm run dev`
4. 在 Obsidian 中启用插件

## 相关链接

- [官方开发文档](https://docs.obsidian.md/Home)
- [示例插件仓库](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Hot-Reload 插件](https://github.com/pjeby/hot-reload) - 开发时自动重载

## 开发规范

### API 调用规范（必须遵守）

**严格遵守官方 API 方法名，不能随意猜测或使用错误的方法名。**

常见错误示例：
- ❌ `button.setText('Login')` → 正确应为 `button.setButtonText('Login')`

正确做法：
1. 调用任何 API 前，先查阅官方文档确认方法名
2. 使用 TypeScript 类型提示，IDE 会自动提示正确的方法名
3. 参考示例插件：https://github.com/obsidianmd/obsidian-sample-plugin

完整规则详见：`docs/rules.md`

### 重要提醒

- **永远不要在主 Vault 中开发插件**，创建专门的测试 Vault
- 使用 `this.app` 而非全局 `app` 对象
- 所有事件处理器必须用 `registerEvent()` 注册，确保卸载时清理
- 使用 `Vault.process()` 而非 `Vault.read()` + `Vault.modify()` 修改文件
- 避免硬编码样式，使用 CSS 类和 Obsidian CSS 变量

### UI 文本规范

- 使用 Sentence case（句子大小写）
- 描述不超过 250 字符
- 避免使用 emoji 或特殊字符

### 安全规范

- 避免使用 `innerHTML`、`outerHTML`、`insertAdjacentHTML`
- 使用 DOM API 创建元素：`createEl()`、`createDiv()`、`createSpan()`