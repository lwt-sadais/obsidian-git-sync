# Obsidian Plugin 开发规则

## API 调用规范

### 严格遵守官方 API 方法名

在调用 Obsidian API 时，必须使用正确的方法名，不能随意猜测或使用错误的方法名。

**常见错误示例**：
- ❌ `button.setText('Login')` → 正确应为 `button.setButtonText('Login')`
- ❌ `text.setValue(value)` → 正确应为 `text.setValue(value)` (这个是正确的)

**正确做法**：
1. 调用任何 API 前，先查阅官方文档确认方法名
2. 使用 TypeScript 类型提示，IDE 会自动提示正确的方法名
3. 参考示例插件：https://github.com/obsidianmd/obsidian-sample-plugin

### 常用 API 方法对照表

| 类/对象 | 正确方法 | 错误用法 |
|---------|----------|----------|
| ButtonComponent | `setButtonText(text)` | `setText(text)` |
| TextComponent | `setValue(value)` | ✅ 正确 |
| Setting | `setName(name)` | ✅ 正确 |
| Setting | `setDesc(desc)` | ✅ 正确 |
| ToggleComponent | `setValue(value)` | ✅ 正确 |
| Notice | `new Notice(message)` | ✅ 正确 |

### 检查方法

如果遇到 UI 元素不显示或功能异常，首先检查：
1. API 方法名是否正确
2. 参数类型是否匹配
3. 是否遗漏必要的方法调用

---

## 功能设计规范

### 保持简单

- 优先选择简单直接的实现方式
- 如果一个功能需要用户大量额外配置（如创建 OAuth App、部署回调页面），考虑是否有更简单的替代方案
- 个人使用的工具不需要追求"完美"的用户体验，实用优先

**示例**：
- ❌ OAuth 登录：需要创建 App、部署回调页面、配置 Client ID
- ✅ Token 登录：一步到位，用户只需创建 Token

---

## 参考资源

- [Obsidian API 文档](https://docs.obsidian.md/Reference/TypeScript+API)
- [示例插件](https://github.com/obsidianmd/obsidian-sample-plugin)
- [开发者文档](https://docs.obsidian.md/Home)