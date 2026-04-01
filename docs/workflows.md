# Obsidian Git Sync 业务流程文档

本文档详细描述各同步操作的完整业务流程。

---

## 一、新增文件流程

**触发方式**：用户在 Obsidian 中创建新文件

**入口**：`main.ts` → `vault.on('create')` → `fileWatcher.handleFileChange()`

```
┌─────────────────────────────────────────────────────────────────┐
│  Obsidian 创建新文件                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: vault.on('create')                                    │
│  → fileWatcher.handleFileChange(file)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  file-watcher.ts: handleFileChange()                            │
│                                                                 │
│  检查条件：                                                       │
│  1. shouldSyncFile(file)? → 检查以下条件：                        │
│     - autoSync 开启？                                            │
│     - isAuthenticated?                                          │
│     - 不在排除路径？                                              │
│     - 文件大小不超限？                                            │
│     - 不是临时文件名？                                            │
│                                                                 │
│  syncEngine.isDownloading（正在下载文件）？                        │
│  → YES: 加入 deferredOperations 队列                            │
│         （Pull 结束后通过 processDeferredOperations 处理）        │
│  → NO:  继续                                                     │
│                                                                 │
│  operationManager.isBlocking（阻塞操作进行中）？                   │
│  → YES: 加入 deferredOperations 队列                            │
│         （操作结束后通过 processDeferredOperations 处理）          │
│  → NO:  addToSyncQueue(file)                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  addToSyncQueue(file)                                           │
│                                                                 │
│  1. stateManager.markFilePending(path, mtime)                   │
│     → 文件状态设为 pending                                        │
│  2. statusBar.setPendingCount(n)                                │
│     → 状态栏显示 "n pending"                                      │
│  3. 设置 debounce 定时器 (300ms)                                  │
│     → 等待用户可能继续编辑，避免频繁同步                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼ (300ms 后)
┌─────────────────────────────────────────────────────────────────┐
│  syncPendingFiles()                                             │
│                                                                 │
│  1. 检查前置条件（认证、仓库配置）                                   │
│  2. operationManager.canStart('upload_batch')?                  │
│     → NO: 返回（有阻塞操作进行中）                                  │
│  3. operationManager.start('upload_batch')                      │
│  4. 获取待同步文件列表：getPendingFiles()                          │
│  5. statusBar.startSyncing()                                    │
│     → 状态栏显示 "⟳ 同步中..."                                     │
│  6. 循环处理每个文件：                                             │
│     ┌─────────────────────────────────────────────┐             │
│     │ statusBar.updateProgress(i/total, 'push')   │             │
│     │ operationManager.updateProgress(i/total)    │             │
│     │ → 显示 "↑i/total"                           │             │
│     │                                             │             │
│     │ syncEngine.uploadSingleFile(file, sha)      │             │
│     │ → 读取文件内容                               │             │
│     │ → Base64 编码                               │             │
│     │ → 调用 GitHub API 上传                      │             │
│     │                                             │             │
│     │ 成功：stateManager.updateFileSynced()       │             │
│     │       → 状态设为 synced，记录 remoteSha      │             │
│     │ 失败：errorCount++                          │             │
│     └─────────────────────────────────────────────┘             │
│  7. operationManager.end()                                      │
│  8. statusBar.endSync(success)                                  │
│     → 显示 "✓ 已同步"                                             │
│  9. Notice: "已同步 n 个文件"                                      │
│  10. processDeferredOperations()                                │
│      → 处理阻塞操作期间积压的操作                                    │
└─────────────────────────────────────────────────────────────────┘
```

**特殊场景：Pull 期间创建文件**

```
Pull 正在下载 → isDownloading = true
               用户创建文件 A
               → handleFileChange(A)
               → 加入 deferredOperations
Pull 结束 → processDeferredOperations()
          → executeDeferredOperation('modify', A)
          → uploadSingleFile(A) ✓
```

**状态栏变化**：
- `○ 离线` → `⏳ n pending` → `⟳ ↑1/n` → `⟳ ↑n/n` → `✓ 已同步`

---

## 二、删除文件流程

**触发方式**：用户在 Obsidian 中删除文件

**入口**：`main.ts` → `vault.on('delete')` → `fileWatcher.handleFileDelete()`

```
┌─────────────────────────────────────────────────────────────────┐
│  Obsidian 删除文件                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: vault.on('delete')                                    │
│  → fileWatcher.handleFileDelete(file)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  file-watcher.ts: handleFileDelete()                            │
│                                                                 │
│  检查条件：                                                       │
│  1. syncEngine.isDeletingLocalFiles? → 跳过（双向同步正在删除）     │
│  2. autoSync 开启 + isAuthenticated?                            │
│  3. isTempFile 或 isExcluded? → 只清除状态，不删除远程             │
│                                                                 │
│  stateManager.clearFileState(path)                              │
│  → 清除本地文件状态记录                                            │
│                                                                 │
│  operationManager.isBlocking（阻塞操作进行中）？                    │
│  → YES: 加入 deferredOperations 队列                             │
│  → NO:  addToDeleteQueue(path)                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  addToDeleteQueue(path)                                         │
│                                                                 │
│  1. 添加到 deleteQueue（避免重复）                                 │
│  2. statusBar.setStatus('pending', 'n pending')                 │
│     → 显示 "⏳ n pending"                                         │
│  3. 设置 debounce 定时器 (300ms)                                  │
│     → 等待批量删除                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼ (300ms 后)
┌─────────────────────────────────────────────────────────────────┐
│  processDeleteQueue()                                           │
│                                                                 │
│  1. 检查前置条件                                                   │
│  2. 复制队列并清空                                                 │
│  3. statusBar.startSyncing()                                    │
│     → 显示 "⟳ 同步中..."                                          │
│  4. 循环处理每个删除：                                             │
│     ┌─────────────────────────────────────────────┐             │
│     │ statusBar.updateProgress(i/total, 'pull')   │             │
│     │ → 显示 "↓i/total"                           │             │
│     │                                             │             │
│     │ syncEngine.deleteRemoteFile(path)           │             │
│     │ → getFileSha(path) 获取远程 SHA             │             │
│     │ → GitHub API 删除文件                       │             │
│     └─────────────────────────────────────────────┘             │
│  5. statusBar.endSync(success)                                  │
│     → 显示 "✓ 已同步"                                             │
│  6. Notice: "已从远程删除：n files"                                 │
│  7. processDeferredOperations()                                 │
└─────────────────────────────────────────────────────────────────┘
```

**状态栏变化**：
- `○ 离线` → `⏳ n pending` → `⟳ ↓1/n` → `⟳ ↓n/n` → `✓ 已同步`

---

## 三、修改文件流程

**触发方式**：用户在 Obsidian 中编辑并保存文件

**入口**：`main.ts` → `vault.on('modify')` → `fileWatcher.handleFileChange()`

```
┌─────────────────────────────────────────────────────────────────┐
│  Obsidian 修改文件                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: vault.on('modify')                                    │
│  → fileWatcher.handleFileChange(file)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  流程与"新增文件"完全相同                                          │
│                                                                 │
│  区别在于 uploadSingleFile 时：                                   │
│  - 新增文件：不带 SHA，GitHub 创建新文件                            │
│  - 修改文件：带 SHA，GitHub 更新现有文件                           │
│                                                                 │
│  SHA 来源：                                                       │
│  - stateManager.getFileState(path)?.remoteSha                   │
│  - 之前同步时记录的远程文件 SHA                                     │
└─────────────────────────────────────────────────────────────────┘
```

**状态栏变化**：与新增文件相同

---

## 四、立即同步流程（双向同步）

**触发方式**：
- 命令面板执行 "Git Sync: Sync Now"
- 状态栏菜单点击 "Sync Now"
- 启动时自动同步（如果开启）

**入口**：`main.ts` → `syncNow()` → `bidirectionalSync()`

```
┌─────────────────────────────────────────────────────────────────┐
│  用户触发 "立即同步"                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: syncNow()                                             │
│  → bidirectionalSync()                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  sync-engine.ts: bidirectionalSync()                            │
│                                                                 │
│  前置检查：                                                       │
│  1. isAuthenticated?                                            │
│  2. repoOwner + repoName 配置？                                  │
│  3. operationManager.canStart('bidirectional')?                 │
│     → NO: 返回（有阻塞操作进行中）                                  │
│                                                                 │
│  operationManager.start('bidirectional')                        │
│  → 阻止文件监听器触发，操作进入 deferredOperations                  │
│                                                                 │
│  statusBar.startSyncing()                                       │
│  → 显示 "⟳ 同步中..."                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第一步：获取远程所有文件                                           │
│                                                                 │
│  client.getAllFiles(owner, repo)                                │
│  → 返回远程文件列表（path + sha）                                  │
│  → 构建 remoteFileMap                                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第二步：拉取远程变更（pullRemoteChanges）                          │
│                                                                 │
│  循环处理每个远程文件：                                             │
│  ┌─────────────────────────────────────────────┐               │
│  │ statusBar.updateProgress(i/total, 'pull')   │               │
│  │                                             │               │
│  │ 跳过：特殊文件（.git/、README.md 等）          │               │
│  │       排除路径/扩展名                         │               │
│  │                                             │               │
│  │ downloader.downloadFile(path, false, sha)   │               │
│  │                                             │               │
│  │ 本地不存在？→ 创建新文件                       │               │
│  │ 本地存在？                                   │               │
│  │   检查冲突：                                  │               │
│  │   - 本地修改时间 > 同步记录时间？              │               │
│  │   → YES: 标记 conflict，暂停同步             │               │
│  │   → NO:  更新本地文件                        │               │
│  └─────────────────────────────────────────────┘               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第三步：检查冲突                                                  │
│                                                                 │
│  conflicts = stateManager.getConflictFiles()                    │
│                                                                 │
│  有冲突？                                                         │
│  → YES: handleConflicts()                                       │
│         • statusBar.setConflictCount(n)                         │
│         • statusBar.endSync(false)                              │
│         • Notice: "同步暂停：检测到 n 个冲突"                       │
│         • 返回，等待用户手动解决                                    │
│  → NO:  继续                                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ (无冲突)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第四步：删除本地多余的文件（deleteLocalFiles）                     │
│                                                                 │
│  找出本地存在但远程不存在的文件：                                    │
│                                                                 │
│  条件：                                                           │
│  1. 远程不存在（!remoteFileMap.has(path)）                        │
│  2. 曾经同步过（fileState.status === 'synced'）                   │
│     → 防止删除从未同步的本地新建文件                                │
│                                                                 │
│  isDeletingLocalFiles = true                                    │
│  → 阻止 fileWatcher.handleFileDelete 触发                        │
│                                                                 │
│  vault.delete(localFile)                                        │
│  → 删除本地文件                                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第五步：推送本地变更（pushLocalChanges）                          │
│                                                                 │
│  循环处理每个本地文件：                                             │
│  ┌─────────────────────────────────────────────┐               │
│  │ statusBar.updateProgress(i/total, 'push')   │               │
│  │                                             │               │
│  │ 跳过：排除规则、临时文件、大文件                │               │
│  │                                             │               │
│  │ 判断是否需要上传：                             │               │
│  │ - 远程不存在？                                │               │
│  │ - 没有同步记录？                              │               │
│  │ - 本地修改时间 > 同步记录时间？                │               │
│  │                                             │               │
│  │ needsUpload?                                │               │
│  │ → YES: uploader.uploadSingleFile()          │               │
│  │ → NO:  跳过                                  │               │
│  └─────────────────────────────────────────────┘               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第六步：完成同步                                                  │
│                                                                 │
│  operationManager.end()                                         │
│                                                                 │
│  statusBar.endSync(success)                                     │
│  → 显示 "✓ 已同步"                                                │
│                                                                 │
│  Notice: "同步完成！已处理 n 个文件"                                │
│                                                                 │
│  processDeferredOperations()                                    │
│  → 处理同步期间积压的文件操作                                       │
└─────────────────────────────────────────────────────────────────┘
```

**状态栏变化**：
- `✓ 已同步` → `⟳ ↓1/n` (拉取阶段) → `⟳ ↑1/n` (推送阶段) → `✓ 已同步`

**冲突情况**：
- `⟳ ↓1/n` → `⚡ n 个冲突` (暂停，等待用户解决)

---

## 五、Pull 流程（以远程为准）

**触发方式**：
- 命令面板执行 "Git Sync: Pull from Remote"
- 状态栏菜单点击 "Pull from Remote"

**入口**：`main.ts` → `pullFromRemote()` → `syncEngine.pullFromRemote()`

```
┌─────────────────────────────────────────────────────────────────┐
│  用户触发 "Pull from Remote"                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: pullFromRemote()                                      │
│                                                                 │
│  前置检查：ensureSyncReady()                                      │
│  → isAuthenticated + repo 配置                                   │
│                                                                 │
│  operationManager.canStart('pull')?                             │
│  → NO: 返回（有阻塞操作进行中）                                     │
│                                                                 │
│  operationManager.start('pull')                                 │
│  syncEngine.pullFromRemote()                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  sync-download.ts: pullFromRemote()                             │
│                                                                 │
│  statusBar.startSyncing()                                       │
│  → 显示 "⟳ 同步中..."                                             │
│                                                                 │
│  第一步：获取远程所有文件                                           │
│  client.getAllFiles(owner, repo)                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第二步：下载远程文件（downloadRemoteFiles）                        │
│                                                                 │
│  循环处理每个远程文件：                                             │
│  ┌─────────────────────────────────────────────┐               │
│  │ statusBar.updateProgress(i/total, 'pull')   │               │
│  │                                             │               │
│  │ 跳过：特殊文件、排除规则                       │               │
│  │                                             │               │
│  │ downloadFile(path, forceOverwrite=true)     │               │
│  │ → 强制覆盖本地文件                            │               │
│  │ → 不检测冲突                                  │               │
│  │                                             │               │
│  │ 本地不存在？→ 创建                            │               │
│  │ 本地存在？→ 覆盖                              │               │
│  └─────────────────────────────────────────────┘               │
│                                                                 │
│  批量暂停：每 5 个文件暂停 500ms，避免 API 限流                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第三步：删除本地多余的文件                                         │
│                                                                 │
│  找出本地存在但远程不存在的文件                                      │
│                                                                 │
│  条件：                                                           │
│  1. 远程不存在                                                    │
│  2. 不在排除规则                                                  │
│  3. 不是临时文件                                                  │
│                                                                 │
│  isDeletingLocalFiles = true                                    │
│  → 阻止 fileWatcher 触发                                          │
│                                                                 │
│  vault.delete(localFile)                                        │
│  → 强制删除本地文件                                                │
│  → 不检查是否曾经同步过                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第四步：完成                                                      │
│                                                                 │
│  operationManager.end()                                         │
│                                                                 │
│  statusBar.endSync(success)                                     │
│                                                                 │
│  Notice: "拉取完成！下载 n 个文件" 或                                │
│          "拉取完成！下载 n 个文件，删除 m 个本地文件"                  │
│                                                                 │
│  processDeferredOperations()                                    │
└─────────────────────────────────────────────────────────────────┘
```

**状态栏变化**：
- `✓ 已同步` → `⟳ ↓1/n` → `⟳ ↓n/n` → `✓ 已同步`

**与双向同步的区别**：
- 强制覆盖本地文件，不检测冲突
- 删除本地文件时不检查是否曾经同步过

---

## 六、Push 流程（以本地为准）

**触发方式**：
- 命令面板执行 "Git Sync: Push to Remote"
- 状态栏菜单点击 "Push to Remote"

**入口**：`main.ts` → `fullSync()` → `syncEngine.fullSync()`

```
┌─────────────────────────────────────────────────────────────────┐
│  用户触发 "Push to Remote"                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.ts: fullSync()                                            │
│                                                                 │
│  前置检查：ensureSyncReady()                                      │
│                                                                 │
│  operationManager.canStart('push')?                             │
│  → NO: 返回（有阻塞操作进行中）                                     │
│                                                                 │
│  operationManager.start('push')                                 │
│  syncEngine.fullSync()                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  sync-upload.ts: fullSync()                                     │
│                                                                 │
│  statusBar.startSyncing()                                       │
│  → 显示 "⟳ 同步中..."                                             │
│                                                                 │
│  第一步：获取远程文件 SHA 映射                                       │
│  fetchRemoteFileMap()                                           │
│  → client.getAllFiles()                                         │
│  → 构建 Map<path, {sha}>                                         │
│  → 用于判断文件是新增还是更新                                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第二步：获取并过滤本地文件                                         │
│                                                                 │
│  getAllVaultFiles(vault)                                        │
│  → 获取所有本地文件                                                 │
│                                                                 │
│  filterFiles():                                                 │
│  → 排除路径                                                        │
│  → 排除扩展名                                                      │
│  → 临时文件名                                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第三步：上传所有本地文件                                           │
│                                                                 │
│  循环处理每个本地文件：                                             │
│  ┌─────────────────────────────────────────────┐               │
│  │ statusBar.updateProgress(i/total, 'push')   │               │
│  │                                             │               │
│  │ 检查文件大小：超限则跳过                        │               │
│  │                                             │               │
│  │ uploadFile():                                │               │
│  │ - 读取文件内容                                │               │
│  │ - Base64 编码                                │               │
│  │ - 查找 remoteSha（如果远程已存在）             │               │
│  │ - GitHub API 上传                            │               │
│  │                                             │               │
│  │ 成功：                                        │               │
│  │ stateManager.updateFileSynced()             │               │
│  │ → 记录 remoteSha                             │               │
│  │                                             │               │
│  │ 批量暂停：每 5 个文件暂停 500ms                 │               │
│  └─────────────────────────────────────────────┘               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  第四步：完成                                                      │
│                                                                 │
│  operationManager.end()                                         │
│                                                                 │
│  statusBar.endSync(success)                                     │
│                                                                 │
│  Notice: "同步完成！已处理 n 个文件"                                │
│                                                                 │
│  processDeferredOperations()                                    │
└─────────────────────────────────────────────────────────────────┘
```

**状态栏变化**：
- `✓ 已同步` → `⟳ ↑1/n` → `⟳ ↑n/n` → `✓ 已同步`

**与双向同步的区别**：
- 不拉取远程变更
- 不删除本地文件
- 只上传，不检测冲突

---

## 七、OperationManager 操作管理器

### 设计目的

统一管理所有同步操作的状态，解决原有标志位分散、语义模糊的问题：

1. **单一职责**：只有一个地方管理"是否忙碌"状态
2. **操作禁用**：状态栏菜单查询 OperationManager 判断是否禁用
3. **进度跟踪**：统一管理操作进度

### 操作类型定义

```typescript
type OperationType =
    | 'idle'              // 无操作
    | 'bidirectional'     // 双向同步（阻塞）
    | 'pull'              // 以远程为准（阻塞）
    | 'push'              // 以本地为准（阻塞）
    | 'upload_batch'      // 批量上传（非阻塞）
    | 'delete_batch'      // 批量删除（非阻塞）
    | 'download_single';  // 单文件下载（内部使用）
```

### 阻塞与非阻塞操作

| 操作类型 | 阻塞 | 说明 |
|---------|------|------|
| `bidirectional` | ✓ | 双向同步期间禁止用户触发其他操作 |
| `pull` | ✓ | Pull 期间禁止用户触发其他操作 |
| `push` | ✓ | Push 期间禁止用户触发其他操作 |
| `upload_batch` | ✗ | 文件监听触发的批量上传，不阻塞 |
| `delete_batch` | ✗ | 文件监听触发的批量删除，不阻塞 |
| `download_single` | ✗ | 内部单文件下载，不阻塞 |

### 状态栏菜单禁用逻辑

```
用户点击状态栏
    ↓
showMenu() 获取当前操作
    ↓
operationManager.getCurrentOperation()
    ↓
判断是否阻塞（isBlocking === true）
    ↓
┌─────────────────────────────────────┐
│  阻塞中：                            │
│  • 显示 "正在同步..."                 │
│  • 禁用所有操作菜单项                 │
│  • 冲突解决选项仍可用                 │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  空闲中：                            │
│  • 显示正常菜单项                    │
│  • Sync Now / Pull / Push 可点击     │
└─────────────────────────────────────┘
```

### API 方法

| 方法 | 说明 |
|------|------|
| `start(type)` | 启动操作 |
| `end()` | 结束操作 |
| `updateProgress(current, total, phase)` | 更新进度 |
| `getCurrentOperation()` | 获取当前操作信息 |
| `isBusy()` | 检查是否有操作正在进行 |
| `isBlocking()` | 检查是否是阻塞型操作 |
| `canStart(type)` | 检查是否可以启动新操作 |

### 与原有标志位的关系

| 原标志位 | 新方案 |
|---------|--------|
| `main.ts: isSyncing` | 已移除，使用 `operationManager.isBlocking()` |
| `sync-download.ts: isDownloading` | 保留，用于阻止 handleFileChange |
| `sync-download.ts: isDeletingLocalFiles` | 保留，用于阻止 handleFileDelete |

**注意**：`isDownloading` 和 `isDeletingLocalFiles` 仍保留，因为它们有特定用途：
- `isDownloading`：下载文件时避免触发 handleFileChange（防止循环）
- `isDeletingLocalFiles`：删除本地文件时避免触发 handleFileDelete（防止循环）

---

## 八、Debounce 策略

| 操作 | Debounce 时间 | 说明 |
|------|--------------|------|
| 新增/修改文件 | 300ms | 等待用户可能继续编辑 |
| 删除文件 | 300ms | 批量删除，减少 API 调用 |

---

## 九、状态流转

```
synced ──(文件变更)──→ pending ──(同步完成)──→ synced
                    │
                    └─(冲突检测)──→ conflict ──(用户解决)──→ pending/synced
```