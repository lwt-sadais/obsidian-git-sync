// 国际化模块

// 支持的语言
type Language = 'zh' | 'en';

// 语言文本定义
const translations = {
    zh: {
        // 设置面板标题
        settingsTitle: 'Git Sync 设置',

        // 账户
        account: '账户',
        githubToken: 'GitHub Token',
        githubTokenDesc: '输入具有 repo 权限的 Personal Access Token',
        login: '登录',
        verifyingToken: '正在验证 Token...',
        loginSuccess: '登录成功！',
        invalidToken: 'Token 无效，请检查后重试。',
        loggedInAs: '已登录为',
        logout: '退出登录',
        logoutSuccess: '已退出登录',
        createToken: '创建 Personal Access Token：',
        githubTokenSettings: 'GitHub Token 设置',

        // 仓库
        repository: '仓库',
        currentRepository: '当前仓库',
        changeRepository: '更换仓库',
        noRepoConfigured: '未配置仓库。创建新仓库或选择已有仓库。',
        createNewRepo: '创建新仓库',
        create: '创建',
        selectExistingRepo: '选择已有仓库',
        select: '选择',
        repoCreated: '仓库已创建：',
        repoSelected: '仓库已选择：',

        // 同步设置
        syncSettings: '同步设置',
        autoSync: '自动同步',
        autoSyncDesc: '文件变更时自动同步',
        fileSizeLimit: '文件大小限制',
        fileSizeLimitDesc: '最大文件大小（MB），GitHub 限制：100MB',
        syncOnStartup: '启动时同步',
        syncOnStartupDesc: 'Obsidian 启动时自动拉取变更',

        // 命令名称
        cmdSyncNow: '立即同步',
        cmdPullFromRemote: '从远程拉取（以远程为准）',
        cmdPushToRemote: '推送到远程（以本地为准）',

        // 状态栏菜单
        menuSyncNow: '立即同步',
        menuPullFromRemote: '从远程拉取（以远程为准）',
        menuPushToRemote: '推送到远程（以本地为准）',
        menuConflicts: '{count} 个冲突',
        menuLastSync: '上次同步：{time}',
        menuNeverSynced: '从未同步',

        // 同步操作通知
        startingSync: '开始同步...',
        syncingFiles: '同步中... {current}/{total} 个文件',
        syncCompleted: '同步完成！已处理 {count} 个文件',
        syncWithErrors: '同步完成但有错误。已处理 {uploaded}，失败 {errors}',
        pullCompleted: '拉取完成！下载 {count} 个文件',
        pullWithDeletes: '拉取完成！下载 {downloaded} 个文件，删除 {deleted} 个文件',
        pushCompleted: '推送完成！上传 {count} 个文件',
        syncedFiles: '已同步 {count} 个文件',
        deletedFromRemote: '已从远程删除：{path}',
        conflictDetected: '检测到冲突：{path}',
        conflictsPaused: '同步暂停：检测到 {count} 个冲突',

        // 冲突解决
        conflictResolutionTitle: '冲突解决',
        conflictResolutionDesc: '检测到 {count} 个文件存在冲突，请选择解决方案',
        conflictKeepLocal: '保留本地版本',
        conflictKeepLocalDesc: '使用本地文件，忽略远程更改',
        conflictUseRemote: '使用远程版本',
        conflictUseRemoteDesc: '用远程文件覆盖本地',
        conflictKeepBoth: '保留两者',
        conflictKeepBothDesc: '本地保留，远程版本另存为副本',
        conflictSmartMerge: '智能合并',
        conflictSmartMergeDesc: '尝试自动合并更改',
        conflictViewDiff: '查看差异',
        conflictBinaryFile: '二进制文件',
        conflictBinaryNoMerge: '二进制文件无法智能合并',
        conflictBinaryNoDiff: '二进制文件无法显示差异',
        applyResolutions: '应用所选操作',
        conflictResolvedCount: '已解决 {success} 个冲突，失败 {failed} 个',
        conflictResolvedKeepLocal: '已保留本地版本：{path}',
        conflictResolvedUseRemote: '已使用远程版本：{path}',
        conflictResolvedKeepBoth: '已保留两者：{path}，副本：{conflictPath}',
        conflictMerged: '已自动合并：{path}',
        conflictMergedWithBlocks: '合并完成，存在冲突块需手动处理：{path}',
        conflictResolveFailed: '解决冲突失败：{path}',
        conflictDiffTitle: '内容差异',
        conflictLocalVersion: '本地版本',
        conflictRemoteVersion: '远程版本',
        close: '关闭',

        // 仓库模态框
        createRepoTitle: '创建新仓库',
        repoName: '仓库名称',
        repoNamePlaceholder: 'obsidian-vault',
        repoDesc: '描述',
        repoDescPlaceholder: 'Obsidian Vault 同步',
        createRepoButton: '创建仓库',
        creatingRepo: '正在创建仓库...',
        createRepoSuccess: '仓库创建成功！',
        createRepoFailed: '创建仓库失败',
        cancel: '取消',

        selectRepoTitle: '选择仓库',
        loadingRepos: '正在加载仓库...',
        noPrivateRepos: '未找到私有仓库。',
        orCreateNew: '或创建新仓库',

        // 错误提示
        pleaseLogin: '请先登录',
        pleaseConfigRepo: '请先配置仓库',
        notAuthenticated: '未认证',
        repoNotConfigured: '仓库未配置',
        downloadFailed: '下载文件失败：{path}',

        // 状态
        statusSynced: '已同步',
        statusSyncing: '同步中',
        statusPending: '待同步',
        statusError: '错误',
        statusConflict: '冲突',
        statusOffline: '离线',

        // 时间
        timeJustNow: '刚刚',
        timeMinutesAgo: '{count} 分钟前',
        timeHoursAgo: '{count} 小时前',
        timeDaysAgo: '{count} 天前'
    },

    en: {
        // Settings title
        settingsTitle: 'Git Sync Settings',

        // Account
        account: 'Account',
        githubToken: 'GitHub Token',
        githubTokenDesc: 'Enter your Personal Access Token with repo scope',
        login: 'Login',
        verifyingToken: 'Verifying token...',
        loginSuccess: 'Successfully logged in!',
        invalidToken: 'Invalid token. Please check and try again.',
        loggedInAs: 'Logged in as',
        logout: 'Logout',
        logoutSuccess: 'Logged out successfully',
        createToken: 'Create a Personal Access Token: ',
        githubTokenSettings: 'GitHub Token Settings',

        // Repository
        repository: 'Repository',
        currentRepository: 'Current Repository',
        changeRepository: 'Change Repository',
        noRepoConfigured: 'No repository configured. Create a new one or select an existing repository.',
        createNewRepo: 'Create New Repository',
        create: 'Create',
        selectExistingRepo: 'Select Existing Repository',
        select: 'Select',
        repoCreated: 'Repository created: ',
        repoSelected: 'Repository selected: ',

        // Sync Settings
        syncSettings: 'Sync Settings',
        autoSync: 'Auto Sync',
        autoSyncDesc: 'Automatically sync on file changes',
        fileSizeLimit: 'File Size Limit',
        fileSizeLimitDesc: 'Maximum file size in MB (GitHub limit: 100MB)',
        syncOnStartup: 'Sync on Startup',
        syncOnStartupDesc: 'Automatically pull changes when Obsidian starts',

        // Command names
        cmdSyncNow: 'Sync now',
        cmdPullFromRemote: 'Pull from remote (use remote as source)',
        cmdPushToRemote: 'Push to remote (use local as source)',

        // Status bar menu
        menuSyncNow: 'Sync now',
        menuPullFromRemote: 'Pull from remote (use remote as source)',
        menuPushToRemote: 'Push to remote (use local as source)',
        menuConflicts: '{count} conflicts',
        menuLastSync: 'Last sync: {time}',
        menuNeverSynced: 'Never synced',

        // Sync notifications
        startingSync: 'Starting sync...',
        syncingFiles: 'Syncing... {current}/{total} files',
        syncCompleted: 'Sync completed! Processed {count} files',
        syncWithErrors: 'Sync completed with errors. Processed {uploaded}, Errors {errors}',
        pullCompleted: 'Pull completed! Downloaded {count} files',
        pullWithDeletes: 'Pull completed! Downloaded {downloaded} files, deleted {deleted} files',
        pushCompleted: 'Push completed! Uploaded {count} files',
        syncedFiles: 'Synced {count} files',
        deletedFromRemote: 'Deleted from remote: {path}',
        conflictDetected: 'Conflict detected: {path}',
        conflictsPaused: 'Sync paused: {count} conflicts detected',

        // Conflict resolution
        conflictResolutionTitle: 'Conflict Resolution',
        conflictResolutionDesc: '{count} files have conflicts. Please choose how to resolve them.',
        conflictKeepLocal: 'Keep local version',
        conflictKeepLocalDesc: 'Use local file, ignore remote changes',
        conflictUseRemote: 'Use remote version',
        conflictUseRemoteDesc: 'Overwrite local with remote file',
        conflictKeepBoth: 'Keep both',
        conflictKeepBothDesc: 'Keep local, save remote as a copy',
        conflictSmartMerge: 'Smart merge',
        conflictSmartMergeDesc: 'Try to automatically merge changes',
        conflictViewDiff: 'View diff',
        conflictBinaryFile: 'Binary file',
        conflictBinaryNoMerge: 'Cannot smart merge binary files',
        conflictBinaryNoDiff: 'Cannot show diff for binary files',
        applyResolutions: 'Apply selected actions',
        conflictResolvedCount: 'Resolved {success} conflicts, failed {failed}',
        conflictResolvedKeepLocal: 'Kept local version: {path}',
        conflictResolvedUseRemote: 'Used remote version: {path}',
        conflictResolvedKeepBoth: 'Kept both: {path}, copy: {conflictPath}',
        conflictMerged: 'Auto merged: {path}',
        conflictMergedWithBlocks: 'Merged with conflict blocks, manual edit needed: {path}',
        conflictResolveFailed: 'Failed to resolve conflict: {path}',
        conflictDiffTitle: 'Content Diff',
        conflictLocalVersion: 'Local Version',
        conflictRemoteVersion: 'Remote Version',
        close: 'Close',

        // Repository Modal
        createRepoTitle: 'Create New Repository',
        repoName: 'Repository Name',
        repoNamePlaceholder: 'obsidian-vault',
        repoDesc: 'Description',
        repoDescPlaceholder: 'Obsidian Vault Sync',
        createRepoButton: 'Create Repository',
        creatingRepo: 'Creating repository...',
        createRepoSuccess: 'Repository created successfully!',
        createRepoFailed: 'Failed to create repository',
        cancel: 'Cancel',

        selectRepoTitle: 'Select Repository',
        loadingRepos: 'Loading repositories...',
        noPrivateRepos: 'No private repositories found.',
        orCreateNew: 'Or create a new repository',

        // Errors
        pleaseLogin: 'Please login first',
        pleaseConfigRepo: 'Please configure repository first',
        notAuthenticated: 'Not authenticated',
        repoNotConfigured: 'Repository not configured',
        downloadFailed: 'Failed to download file: {path}',

        // Status
        statusSynced: 'Synced',
        statusSyncing: 'Syncing',
        statusPending: 'Pending',
        statusError: 'Error',
        statusConflict: 'Conflict',
        statusOffline: 'Offline',

        // Time
        timeJustNow: 'just now',
        timeMinutesAgo: '{count}m ago',
        timeHoursAgo: '{count}h ago',
        timeDaysAgo: '{count}d ago'
    }
};

// 获取系统语言
function getSystemLanguage(): Language {
    // @ts-ignore
    const lang = navigator.language || navigator.userLanguage || 'zh';
    if (lang.toLowerCase().startsWith('zh')) {
        return 'zh';
    }
    return 'en';
}

// 当前语言
let currentLanguage: Language = getSystemLanguage();

// 获取翻译文本
export function t(key: string, params?: Record<string, string | number>): string {
    const texts = translations[currentLanguage];
    let text = texts[key as keyof typeof texts] || key;
    
    // 替换参数
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(`{${k}}`, String(v));
        }
    }
    
    return text;
}

// 获取当前语言
export function getCurrentLanguage(): Language {
    return currentLanguage;
}

// 设置语言
export function setLanguage(lang: Language): void {
    currentLanguage = lang;
}

// 导出语言类型
export type { Language };
