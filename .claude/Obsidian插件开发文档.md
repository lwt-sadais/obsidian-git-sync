# Obsidian 插件开发文档

> 整理自官方文档：https://docs.obsidian.md/Home

---

## 目录

1. [概述](#概述)
2. [快速开始：构建你的第一个插件](#快速开始构建你的第一个插件)
3. [插件结构](#插件结构)
4. [开发工作流](#开发工作流)
5. [事件系统](#事件系统)
6. [Vault API](#vault-api)
7. [用户界面](#用户界面)
8. [移动端开发](#移动端开发)
9. [使用 React 开发插件](#使用-react-开发插件)
10. [使用 Svelte 开发插件](#使用-svelte-开发插件)
11. [发布插件](#发布插件)
12. [开发者政策](#开发者政策)
13. [插件指南](#插件指南)
14. [API 参考](#api-参考)

---

## 概述

Obsidian 插件让你可以用 TypeScript 扩展 Obsidian 的功能，创建自定义的笔记体验。

### 插件能做什么

- 添加新的命令和功能
- 创建自定义视图和界面
- 操作笔记和文件
- 集成外部服务
- 扩展编辑器功能

### 加入开发者社区

- Discord: `#plugin-dev` 和 `#theme-dev` 频道
- 论坛: Developers & API 和 Share & showcase 板块

---

## 快速开始：构建你的第一个插件

### 前置要求

- Git 已安装在本地机器
- Node.js 开发环境
- 代码编辑器（如 Visual Studio Code）

### 重要提示

**永远不要在主 vault 中开发插件。** 创建一个专门用于插件开发的空 vault，以防止数据丢失。

### 步骤 1：下载示例插件

打开终端，进入 vault 的插件目录：

```bash
cd path/to/vault
mkdir .obsidian/plugins
cd .obsidian/plugins
```

克隆示例插件：

```bash
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git
```

> 注意：示例仓库是 GitHub 模板仓库，你可以从中创建自己的仓库。

### 步骤 2：构建插件

```bash
cd obsidian-sample-plugin
npm install
npm run dev
```

`npm run dev` 命令会持续运行，当你修改源代码时自动重新编译插件。

编译后会生成 `main.js` 文件。

### 步骤 3：启用插件

1. 在 Obsidian 中打开 **Settings**
2. 在侧边菜单选择 **Community plugins**
3. 选择 **Turn on community plugins**
4. 在 **Installed plugins** 下启用 **Sample Plugin**

### 步骤 4：更新插件清单

编辑 `manifest.json` 文件：

```json
{
  "id": "hello-world",
  "name": "Hello world",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "A simple hello world plugin",
  "author": "Your Name",
  "authorUrl": "https://your-website.com",
  "isDesktopOnly": false
}
```

将插件文件夹重命名为与 `id` 匹配的名称，然后重启 Obsidian。

### 步骤 5：修改源代码

编辑 `main.ts` 文件：

```typescript
import { Notice, Plugin } from 'obsidian';

export default class HelloWorldPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon('dice', 'Greet', () => {
      new Notice('Hello, world!');
    });
  }
}
```

在 Command palette 中选择 **Reload app without saving** 重新加载插件。

### 热重载

安装 [Hot-Reload 插件](https://github.com/pjeby/hot-reload) 可以在开发时自动重新加载插件。

---

## 插件结构

### 生命周期

`Plugin` 类定义了插件的生命周期：

```typescript
import { Plugin } from 'obsidian';

export default class ExamplePlugin extends Plugin {
  async onload() {
    // 插件加载时配置所需资源
    console.log('loading plugin');
  }

  async onunload() {
    // 插件卸载时释放资源
    console.log('unloading plugin');
  }
}
```

### 生命周期方法

| 方法 | 说明 |
|------|------|
| `onload()` | 用户开始使用插件时运行，配置插件大部分功能 |
| `onunload()` | 插件被禁用时运行，释放所有资源 |

### 查看控制台

- Windows/Linux: `Ctrl+Shift+I`
- macOS: `Cmd+Option+I`

---

## 开发工作流

### 在 Obsidian 内重新加载插件

1. 打开 Preferences
2. 点击 Community plugins
3. 在 Installed plugins 下找到你的插件
4. 关闭开关禁用插件
5. 打开开关启用插件

### 文件变化时自动重新加载

使用 [Hot-Reload 插件](https://github.com/pjeby/hot-reload) 自动在源代码变化时重新加载插件。

---

## 事件系统

Obsidian 提供了事件订阅机制，允许插件响应应用程序中的各种事件。

### 注册事件处理器

```typescript
import { Plugin } from 'obsidian';

export default class ExamplePlugin extends Plugin {
  async onload() {
    this.registerEvent(this.app.vault.on('create', () => {
      console.log('a new file has entered the arena');
    }));
  }
}
```

> **重要**：所有注册的事件处理器必须在插件卸载时分离。使用 `registerEvent()` 方法可以确保这一点。

### 定时事件

使用 `window.setInterval()` 配合 `registerInterval()` 方法：

```typescript
import { moment, Plugin } from 'obsidian';

export default class ExamplePlugin extends Plugin {
  statusBar: HTMLElement;

  async onload() {
    this.statusBar = this.addStatusBarItem();
    this.updateStatusBar();

    this.registerInterval(
      window.setInterval(() => this.updateStatusBar(), 1000)
    );
  }

  updateStatusBar() {
    this.statusBar.setText(moment().format('H:mm:ss'));
  }
}
```

### 日期和时间

Obsidian 内部使用 Moment.js，可以直接从 API 导入：

```typescript
import { moment } from 'obsidian';
```

---

## Vault API

每个 Obsidian 笔记集合称为一个 Vault，由一个文件夹及其子文件夹组成。

### 列出文件

```typescript
// 列出所有 Markdown 文件
const files = this.app.vault.getMarkdownFiles();

for (let i = 0; i < files.length; i++) {
  console.log(files[i].path);
}

// 列出所有文件（不仅是 Markdown）
const allFiles = this.app.vault.getFiles();
```

### 读取文件

| 方法 | 用途 |
|------|------|
| `cachedRead()` | 仅显示内容给用户，避免多次从磁盘读取 |
| `read()` | 读取内容、修改后写回磁盘，避免覆盖文件 |

```typescript
import { Notice, Plugin } from 'obsidian';

export default class ExamplePlugin extends Plugin {
  async onload() {
    this.addRibbonIcon('info', 'Calculate average file length', async () => {
      const fileLength = await this.averageFileLength();
      new Notice(`The average file length is ${fileLength} characters.`);
    });
  }

  async averageFileLength(): Promise<number> {
    const { vault } = this.app;

    const fileContents: string[] = await Promise.all(
      vault.getMarkdownFiles().map((file) => vault.cachedRead(file))
    );

    let totalLength = 0;
    fileContents.forEach((content) => {
      totalLength += content.length;
    });

    return totalLength / fileContents.length;
  }
}
```

### 修改文件

写入文本内容：

```typescript
function writeCurrentDate(vault: Vault, file: TFile): Promise<void> {
  return vault.modify(file, `Today is ${new Intl.DateTimeFormat().format(new Date())}.`);
}
```

基于当前内容修改（推荐）：

```typescript
function emojify(vault: Vault, file: TFile): Promise<string> {
  return vault.process(file, (data) => {
    return data.replace(':)', '🙂');
  });
}
```

> **注意**：`Vault.process()` 保证文件在读取当前内容和写入更新内容之间不会改变。始终优先使用 `process()` 而非 `read()`/`modify()`。

### 异步修改

`Vault.process()` 只支持同步修改。如果需要异步修改：

1. 使用 `Vault.cachedRead()` 读取文件
2. 执行异步操作
3. 使用 `Vault.process()` 更新文件

确保检查 `process()` 回调中的数据是否与 `cachedRead()` 返回的数据相同。

### 删除文件

| 方法 | 说明 |
|------|------|
| `delete()` | 彻底删除文件 |
| `trash()` | 移动到回收站（系统回收站或本地 `.trash` 文件夹） |

### 判断文件还是文件夹

```typescript
const folderOrFile = this.app.vault.getAbstractFileByPath('folderOrFile');

if (folderOrFile instanceof TFile) {
  console.log('It\'s a file!');
} else if (folderOrFile instanceof TFolder) {
  console.log('It\'s a folder!');
}
```

---

## 用户界面

### 功能区图标 (Ribbon Icon)

```typescript
this.addRibbonIcon('icon-name', 'Tooltip text', (evt: MouseEvent) => {
  // 点击时执行
});
```

### 命令 (Commands)

```typescript
this.addCommand({
  id: 'my-command-id',
  name: 'My Command Name',
  callback: () => {
    // 无条件执行
  }
});

// 带条件的命令
this.addCommand({
  id: 'conditional-command',
  name: 'Conditional Command',
  checkCallback: (checking: boolean) => {
    if (checking) {
      // 返回是否应该显示命令
      return condition;
    }
    // 执行命令
  }
});

// 编辑器命令
this.addCommand({
  id: 'editor-command',
  name: 'Editor Command',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    editor.replaceSelection('Replaced text');
  }
});
```

### 状态栏 (Status Bar)

```typescript
const statusBarItem = this.addStatusBarItem();
statusBarItem.setText('Status text');
```

### 模态框 (Modal)

```typescript
import { App, Modal, Plugin } from 'obsidian';

class MyModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText('Modal content');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// 在插件中打开
new MyModal(this.app).open();
```

### 设置面板 (Settings Tab)

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';

class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting name')
      .setDesc('Setting description')
      .addText(text => text
        .setPlaceholder('Placeholder')
        .setValue(this.plugin.settings.mySetting)
        .onChange(async (value) => {
          this.plugin.settings.mySetting = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

### 视图 (Views)

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_EXAMPLE = 'example-view';

export class ExampleView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText() {
    return 'Example view';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl('h4', { text: 'Example View' });
  }

  async onClose() {
    // 清理
  }
}
```

---

## 移动端开发

### 在桌面端模拟移动设备

在开发者工具控制台输入：

```typescript
// 启用移动模拟
this.app.emulateMobile(true);

// 禁用移动模拟
this.app.emulateMobile(false);

// 切换移动模拟
this.app.emulateMobile(!this.app.isMobile);
```

### 平台检测

```typescript
import { Platform } from 'obsidian';

if (Platform.isIosApp) {
  // iOS 特定代码
}

if (Platform.isAndroidApp) {
  // Android 特定代码
}
```

### 在移动设备上调试

**Android：**
1. 启用 USB 调试
2. 在 Chrome 浏览器访问 `chrome://inspect/`

**iOS (16.4+)：**
1. 启用 Web Inspector
2. 参考：https://webkit.org/web-inspector/enabling-web-inspector/

### 禁用移动端插件

如果插件需要 Node.js 或 Electron API，在 `manifest.json` 中设置：

```json
{
  "isDesktopOnly": true
}
```

### 常见问题

- **Node 和 Electron API 在移动端不可用**
- **iOS 16.4 以下不支持正则表达式后瞻**

---

## 使用 React 开发插件

### 安装依赖

```bash
npm install --save-dev react react-dom
npm install --save-dev @types/react @types/react-dom
```

### 配置 esbuild

在 `esbuild.config.mjs` 中添加：

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/markdown",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  define: { "process.env.NODE_ENV": prod ? '"production"' : '"development"' },
});
```

### 创建 React 组件

```tsx
import * as React from 'react';

interface CounterProps {
  initialCount: number;
}

export const Counter: React.FC<CounterProps> = ({ initialCount }) => {
  const [count, setCount] = React.useState(initialCount);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};
```

### 在 Obsidian 中使用

```typescript
import { App, ItemView, WorkspaceLeaf, Platform } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Counter } from './Counter';

export const VIEW_TYPE_REACT = 'react-view';

export class ReactView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_REACT;
  }

  getDisplayText() {
    return 'React View';
  }

  async onOpen() {
    ReactDOM.createRoot(this.containerEl.children[1]).render(
      <React.StrictMode>
        <Counter initialCount={0} />
      </React.StrictMode>
    );
  }

  async onClose() {
    ReactDOM.unmountComponentAtNode(this.containerEl.children[1]);
  }
}
```

---

## 使用 Svelte 开发插件

### 安装依赖

```bash
npm install --save-dev svelte svelte-preprocess esbuild-svelte svelte-check
```

### 配置 tsconfig.json

```json
{
  "compilerOptions": {
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": [
    "**/*.ts",
    "**/*.svelte"
  ]
}
```

### 配置 esbuild.config.mjs

```javascript
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';

const context = await esbuild.context({
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: 'injected' },
      preprocess: sveltePreprocess(),
    }),
  ],
  // ...
});
```

### 创建 Svelte 组件

```svelte
<script lang="ts">
  interface Props {
    startCount: number;
  }

  let { startCount }: Props = $props();
  let count = $state(startCount);

  export function increment() {
    count += 1;
  }
</script>

<div class="number">
  <span>My number is {count}!</span>
</div>

<style>
  .number {
    color: red;
  }
</style>
```

### 挂载 Svelte 组件

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import Counter from './Counter.svelte';
import { mount, unmount } from 'svelte';

export const VIEW_TYPE_EXAMPLE = 'example-view';

export class ExampleView extends ItemView {
  counter: ReturnType<typeof Counter> | undefined;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText() {
    return 'Example view';
  }

  async onOpen() {
    this.counter = mount(Counter, {
      target: this.contentEl,
      props: {
        startCount: 5,
      }
    });
  }

  async onClose() {
    if (this.counter) {
      unmount(this.counter);
    }
  }
}
```

---

## 发布插件

### 提交前准备

确保仓库根目录包含以下文件：

| 文件 | 说明 |
|------|------|
| `README.md` | 描述插件用途和使用方法 |
| `LICENSE` | 许可证文件 |
| `manifest.json` | 插件清单 |

### 步骤 1：发布到 GitHub

确保源代码在 GitHub 上公开可访问。

### 步骤 2：创建发布版本

1. 更新 `manifest.json` 中的 `version`（使用语义化版本 x.y.z 格式）
2. 创建 GitHub Release，标签版本需与 `manifest.json` 匹配
3. 上传以下文件作为二进制附件：
   - `main.js`
   - `manifest.json`
   - `styles.css`（可选）

### 步骤 3：提交审核

1. 编辑 [community-plugins.json](https://github.com/obsidianmd/obsidian-releases/edit/master/community-plugins.json)
2. 在 JSON 数组末尾添加条目：

```json
{
  "id": "my-plugin-id",
  "name": "My Plugin Name",
  "author": "Author Name",
  "description": "Plugin description.",
  "repo": "username/repo-name"
}
```

3. 提交 Pull Request
4. 等待自动验证（`Ready for review` 标签表示通过）
5. 等待 Obsidian 团队审核

### 使用 GitHub Actions 自动发布

在 `.github/workflows/release.yml` 创建：

```yaml
name: Release Obsidian plugin

on:
  push:
    tags:
      - "*"

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18.x"

      - name: Build plugin
        run: |
          npm install
          npm run build

      - name: Create release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          gh release create "$tag" \
            --title="$tag" \
            --draft \
            main.js manifest.json styles.css
```

### Beta 测试

在正式提交前，可以使用 [BRAT 插件](https://github.com/TfTHacker/obsidian42-brat) 进行 beta 测试。

---

## 开发者政策

### 禁止行为

插件和主题不得：

- 混淆代码以隐藏其目的
- 插入通过网络加载的动态广告
- 在插件自身界面外插入静态广告
- 包含客户端遥测
- 包含自动更新机制
- 主题不得从网络加载资源

### 需披露的行为

以下行为需要在 README 中明确说明：

- 需要付费才能完全访问
- 需要账户才能完全访问
- 网络使用（说明使用的远程服务及原因）
- 访问 vault 外的文件（说明原因）
- 插件界面内的静态广告
- 服务端遥测（必须链接隐私政策）
- 闭源代码

### 版权和许可

- 必须包含 LICENSE 文件
- 遵守使用的任何代码的原始许可证
- 尊重 Obsidian 商标政策

---

## 插件指南

### 通用规范

#### 避免使用全局 app 实例

不要使用 `app` 或 `window.app`，使用插件实例提供的引用：

```typescript
// 错误
const app = window.app;

// 正确
const app = this.app;
```

#### 避免不必要的控制台日志

默认配置下，控制台应只显示错误消息。

#### 重命名占位符类名

将示例插件中的 `MyPlugin`、`MyPluginSettings` 等重命名为反映插件名称的名称。

### 移动端注意事项

- Node.js 和 Electron API 在移动端不可用
- iOS 16.4 以下不支持正则表达式后瞻

### UI 文本规范

- 使用句子大小写（Sentence case）
- 避免在设置标题中使用 "settings"
- 仅在有多于一个部分时才在设置下使用标题
- 使用 `setHeading()` 而非 `<h1>`、`<h2>`

```typescript
new Setting(containerEl).setName('your heading title').setHeading();
```

### 安全规范

避免使用 `innerHTML`、`outerHTML`、`insertAdjacentHTML`：

```typescript
// 危险！
containerElement.innerHTML = `<div>${name}</div>`;

// 安全
const el = containerEl.createDiv({cls: 'my-class'});
el.createSpan({text: name});
```

### 资源管理

清理插件卸载时的资源：

```typescript
export default class MyPlugin extends Plugin {
  onload() {
    this.registerEvent(this.app.vault.on('create', this.onCreate));
  }
}
```

### 命令规范

- 避免为命令设置默认快捷键
- 使用正确的回调类型：
  - `callback`：无条件执行
  - `checkCallback`：有条件执行
  - `editorCallback`/`editorCheckCallback`：需要编辑器

### 工作区规范

#### 获取活动视图

```typescript
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  // ...
}
```

#### 获取活动编辑器

```typescript
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  // ...
}
```

#### 避免管理自定义视图引用

```typescript
// 错误
this.registerView(MY_VIEW_TYPE, () => this.view = new MyCustomView());

// 正确
this.registerView(MY_VIEW_TYPE, () => new MyCustomView());
```

### Vault 操作规范

#### 编辑活动笔记

使用 Editor API 而非 `Vault.modify()`：

```typescript
const editor = this.app.workspace.activeEditor?.editor;
editor.replaceSelection('new text');
```

#### 后台修改文件

使用 `Vault.process()` 而非 `Vault.modify()`：

```typescript
await vault.process(file, (data) => {
  return data.replace('old', 'new');
});
```

#### 修改 frontmatter

使用 `FileManager.processFrontMatter`：

```typescript
this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter.customField = 'value';
});
```

#### 路径处理

使用 `normalizePath()` 清理用户定义的路径：

```typescript
import { normalizePath } from 'obsidian';
const pathToPlugin = normalizePath('//my-folder\file');
// 结果: "my-folder/file"
```

### 样式规范

避免硬编码样式：

```typescript
// 错误
el.style.color = 'white';
el.style.backgroundColor = 'red';

// 正确
const el = containerEl.createDiv({cls: 'warning-container'});
```

```css
.warning-container {
  color: var(--text-normal);
  background-color: var(--background-modifier-error);
}
```

---

## API 参考

### Manifest 属性

#### 通用属性

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `author` | string | 是 | 作者名称 |
| `minAppVersion` | string | 是 | 最低 Obsidian 版本 |
| `name` | string | 是 | 显示名称 |
| `version` | string | 是 | 版本号（x.y.z 格式） |
| `authorUrl` | string | 否 | 作者网站 URL |
| `fundingUrl` | string/object | 否 | 赞助链接 |

#### 插件专属属性

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `description` | string | 是 | 插件描述 |
| `id` | string | 是 | 插件 ID（不能包含 obsidian） |
| `isDesktopOnly` | boolean | 是 | 是否仅支持桌面端 |

### fundingUrl 配置

单个链接：

```json
{
  "fundingUrl": "https://buymeacoffee.com"
}
```

多个链接：

```json
{
  "fundingUrl": {
    "Buy Me a Coffee": "https://buymeacoffee.com",
    "GitHub Sponsor": "https://github.com/sponsors",
    "Patreon": "https://www.patreon.com/"
  }
}
```

### 核心 API 类

- `Plugin` - 插件基类
- `App` - 应用实例
- `Vault` - 文件系统操作
- `Workspace` - 工作区管理
- `Editor` - 编辑器操作
- `MarkdownView` - Markdown 视图
- `Modal` - 模态框
- `Notice` - 通知消息
- `Setting` - 设置组件
- `Menu` - 右键菜单
- `TFile` - 文件对象
- `TFolder` - 文件夹对象
- `MetadataCache` - 元数据缓存
- `FileManager` - 文件管理

### 常用导入

```typescript
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  TFile,
  TFolder,
  MarkdownView,
  Editor,
  WorkspaceLeaf,
  ItemView,
  Platform,
  moment,
  normalizePath,
} from 'obsidian';
```

---

## 相关链接

- [Obsidian 官方帮助文档](https://help.obsidian.md/)
- [示例插件仓库](https://github.com/obsidianmd/obsidian-sample-plugin)
- [插件发布仓库](https://github.com/obsidianmd/obsidian-releases)
- [开发者文档 GitHub](https://github.com/obsidianmd/obsidian-developer-docs)
- [Discord 社区](https://obsidian.md/community)
- [开发者论坛](https://forum.obsidian.md/c/developers-api/14)