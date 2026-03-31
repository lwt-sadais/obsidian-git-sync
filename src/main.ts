import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { AuthManager } from './auth/auth-manager';
import { encryptToken, decryptToken, isEncrypted } from './auth/encryption';
import { AuthStatus, GitHubRepository } from './api/types';
import { RepoManager, CreateRepoModal, SelectRepoModal } from './ui/repo-manager';
import { SyncEngine } from './sync/sync-engine';
import { StateManager } from './sync/state-manager';
import { StatusBarManager } from './ui/status-bar';
import { t } from './i18n';

// 插件设置接口
interface GitSyncSettings {
    // GitHub 认证
    githubToken: string;
    githubUsername: string;

    // 仓库信息
    repoOwner: string;
    repoName: string;

    // 同步设置
    autoSync: boolean;
    fileSizeLimit: number;
    syncOnStartup: boolean;

    // 排除规则
    excludedPaths: string[];
    excludedExtensions: string[];
}

// 默认设置
const DEFAULT_SETTINGS: GitSyncSettings = {
    githubToken: '',
    githubUsername: '',
    repoOwner: '',
    repoName: '',
    autoSync: true,
    fileSizeLimit: 100, // MB
    syncOnStartup: true,
    excludedPaths: [
        '.obsidian/plugins/obsidian-git-sync/',
        '.obsidian/workspace.json',
        '.obsidian/workspace-mobile.json',
        '.trash/'
    ],
    excludedExtensions: []
}

export default class GitSyncPlugin extends Plugin {
    settings: GitSyncSettings;
    authManager: AuthManager;
    repoManager: RepoManager;
    syncEngine: SyncEngine;
    stateManager: StateManager;
    statusBar: StatusBarManager;
    isAuthenticated: boolean = false;

    // 文件变更 debounce 定时器
    fileChangeTimer: number | null = null;

    async onload() {
        await this.loadSettings();

        // 初始化认证管理器
        this.authManager = new AuthManager();
        this.repoManager = new RepoManager(this);
        this.syncEngine = new SyncEngine(this);
        this.stateManager = new StateManager(this);
        await this.stateManager.loadState();
        this.authManager.setOnAuthChange((status: AuthStatus) => {
            this.isAuthenticated = status.isAuthenticated;
            if (status.username) {
                this.settings.githubUsername = status.username;
                this.saveSettings();
            }
        });

        // 尝试使用保存的 Token 自动认证
        if (this.settings.githubToken) {
            const token = isEncrypted(this.settings.githubToken)
                ? decryptToken(this.settings.githubToken)
                : this.settings.githubToken;

            if (token) {
                const success = await this.authManager.authenticateWithToken(token);
                if (success) {
                    this.isAuthenticated = true;
                    console.log('Auto-authenticated with saved token');
                }
            }
        }

        // 注册设置面板
        this.addSettingTab(new GitSyncSettingTab(this.app, this));

        // 注册命令：日常同步（双向）
        this.addCommand({
            id: 'sync-now',
            name: t('cmdSyncNow'),
            callback: () => this.syncNow()
        });

        // 注册命令：以远程为准（全量下载）
        this.addCommand({
            id: 'pull-from-remote',
            name: t('cmdPullFromRemote'),
            callback: () => this.pullFromRemote()
        });

        // 注册命令：以本地为准（全量上传）
        this.addCommand({
            id: 'full-sync',
            name: t('cmdPushToRemote'),
            callback: () => this.fullSync()
        });

        // 注册状态栏
        this.statusBar = new StatusBarManager(this);

        // 初始化状态
        if (this.isAuthenticated) {
            this.statusBar.setStatus('synced');
        } else {
            this.statusBar.setStatus('offline');
        }

        // 注册文件变更监听
        this.registerFileWatcher();

        // 启动时同步（如果配置了）
        if (this.settings.syncOnStartup && this.isAuthenticated && this.settings.repoOwner && this.settings.repoName) {
            // 延迟 2 秒后执行，避免阻塞 Obsidian 启动
            setTimeout(() => {
                this.bidirectionalSync();
            }, 2000);
        }

        console.log('Git Sync plugin loaded');
    }

    onunload() {
        // 清理定时器
        if (this.fileChangeTimer) {
            window.clearTimeout(this.fileChangeTimer);
            this.fileChangeTimer = null;
        }
        console.log('Git Sync plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 注册文件变更监听
    registerFileWatcher() {
        // 监听文件修改事件
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.handleFileChange(file);
                }
            })
        );

        // 监听文件创建事件
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.handleFileChange(file);
                }
            })
        );

        // 监听文件删除事件
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.handleFileDelete(file);
                }
            })
        );

        // 监听文件重命名事件
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.handleFileRename(file, oldPath);
                }
            })
        );
    }

    // 临时文件名列表（新建笔记时的默认名称，需要过滤）
    private static TEMP_FILE_NAMES = [
        '未命名',
        'Untitled',
        'Untitled-1',
        'Untitled-2',
        'Untitled-3',
        'New note',
        '新笔记'
    ];

    // 处理文件变更
    handleFileChange(file: TFile) {
        // 检查是否启用自动同步
        if (!this.settings.autoSync) {
            return;
        }

        // 检查是否已认证
        if (!this.isAuthenticated) {
            return;
        }

        // 检查排除规则
        if (this.syncEngine.shouldExcludeFile(file.path)) {
            return;
        }

        // 检查文件大小
        if (!this.syncEngine.isFileSizeOk(file.stat.size)) {
            return;
        }

        // 检查是否为临时文件名（新建笔记时的默认名称，直接跳过）
        const fileName = file.basename;
        if (GitSyncPlugin.TEMP_FILE_NAMES.some(tempName =>
            fileName === tempName || fileName.startsWith(tempName + '-')
        )) {
            // 跳过临时文件名，不同步
            return;
        }

        // 正常文件，直接加入同步队列
        this.addToSyncQueue(file);
    }

    // 将文件添加到同步队列
    private addToSyncQueue(file: TFile) {
        // 标记文件待同步状态
        this.stateManager.markFilePending(file.path, new Date(file.stat.mtime).toISOString());

        // 更新状态栏
        const pendingCount = this.stateManager.getPendingFiles().length;
        this.statusBar.setPendingCount(pendingCount);

        // debounce: 300ms 后执行同步
        if (this.fileChangeTimer) {
            window.clearTimeout(this.fileChangeTimer);
        }

        this.fileChangeTimer = window.setTimeout(() => {
            this.syncPendingFiles();
        }, 300);
    }

    // 处理文件删除
    handleFileDelete(file: TFile) {
        if (!this.settings.autoSync || !this.isAuthenticated) {
            return;
        }

        // 清除文件状态
        this.stateManager.clearFileState(file.path);

        // 检查是否为临时文件名（如果是，不需要删除远程文件）
        const fileName = file.basename;
        const wasTempFile = GitSyncPlugin.TEMP_FILE_NAMES.some(tempName =>
            fileName === tempName || fileName.startsWith(tempName + '-')
        );

        // 如果不是临时文件且不在排除规则中，删除远程文件
        if (!wasTempFile && !this.syncEngine.shouldExcludeFile(file.path)) {
            // 直接删除远程文件
            this.deleteRemoteFile(file.path);
        }

        // 更新状态栏
        const pendingCount = this.stateManager.getPendingFiles().length;
        this.statusBar.setPendingCount(pendingCount);
    }

    // 删除远程文件
    private async deleteRemoteFile(path: string) {
        if (!this.isAuthenticated || !this.settings.repoOwner || !this.settings.repoName) {
            return;
        }

        const client = this.authManager.getClient();
        if (!client) {
            return;
        }

        this.syncEngine.setClient(client);
        const success = await this.syncEngine.deleteRemoteFile(path);

        if (success) {
            new Notice(t('deletedFromRemote', { path }));
        }
    }

    // 处理文件重命名/移动
    handleFileRename(file: TFile, oldPath: string) {
        if (!this.settings.autoSync || !this.isAuthenticated) {
            return;
        }

        // 清除旧文件状态
        this.stateManager.clearFileState(oldPath);

        // 检查旧路径是否为临时文件名（如果是，不需要删除远程文件）
        const oldFileName = this.getFileNameFromPath(oldPath);
        const wasTempFile = GitSyncPlugin.TEMP_FILE_NAMES.some(tempName =>
            oldFileName === tempName || oldFileName.startsWith(tempName + '-')
        );

        // 如果旧路径不是临时文件，说明可能已同步到 GitHub，需要删除
        if (!wasTempFile && !this.syncEngine.shouldExcludeFile(oldPath)) {
            // 直接删除远程旧路径文件
            this.deleteRemoteFile(oldPath);
        }

        // 检查新文件名是否为临时名称
        const fileName = file.basename;
        if (GitSyncPlugin.TEMP_FILE_NAMES.some(tempName =>
            fileName === tempName || fileName.startsWith(tempName + '-')
        )) {
            // 新名称仍然是临时名称，跳过
            return;
        }

        // 新名称不是临时名称，添加到同步队列
        if (!this.syncEngine.shouldExcludeFile(file.path)) {
            this.addToSyncQueue(file);
        }
    }

    // 从路径中提取文件名（不含扩展名）
    private getFileNameFromPath(path: string): string {
        const fileName = path.split('/').pop() || '';
        // 移除所有扩展名
        const dotIndex = fileName.lastIndexOf('.');
        return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
    }

    // 同步待同步文件
    async syncPendingFiles() {
        if (!this.isAuthenticated || !this.settings.repoOwner || !this.settings.repoName) {
            return;
        }

        const client = this.authManager.getClient();
        if (!client) {
            return;
        }

        this.syncEngine.setClient(client);

        // 从 stateManager 获取待同步文件
        const filesToSync = this.stateManager.getPendingFiles();
        if (filesToSync.length === 0) {
            return;
        }

        // 开始同步
        this.statusBar.startSyncing();

        let successCount = 0;
        let errorCount = 0;

        for (const filePath of filesToSync) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                const success = await this.syncEngine.uploadSingleFile(file);
                if (success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } else {
                // 文件已不存在，清除状态
                this.stateManager.clearFileState(filePath);
            }
        }

        // 结束同步
        this.statusBar.endSync(errorCount === 0);

        if (successCount > 0) {
            new Notice(t('syncedFiles', { count: successCount }));
        }

        // 更新状态栏待同步数量
        const pendingCount = this.stateManager.getPendingFiles().length;
        this.statusBar.setPendingCount(pendingCount);
    }

    async syncNow() {
        console.log('Sync now triggered');
        await this.bidirectionalSync();
    }

    async fullSync() {
        console.log('Full sync triggered');

        if (!this.isAuthenticated) {
            new Notice(t('pleaseLogin'));
            return;
        }

        if (!this.settings.repoOwner || !this.settings.repoName) {
            new Notice(t('pleaseConfigRepo'));
            return;
        }

        const client = this.authManager.getClient();
        if (!client) {
            new Notice(t('notAuthenticated'));
            return;
        }

        this.syncEngine.setClient(client);
        await this.syncEngine.fullSync();
    }

    async pullFromRemote() {
        console.log('Pull from remote triggered');

        if (!this.isAuthenticated) {
            new Notice(t('pleaseLogin'));
            return;
        }

        if (!this.settings.repoOwner || !this.settings.repoName) {
            new Notice(t('pleaseConfigRepo'));
            return;
        }

        const client = this.authManager.getClient();
        if (!client) {
            new Notice(t('notAuthenticated'));
            return;
        }

        this.syncEngine.setClient(client);
        await this.syncEngine.pullFromRemote();
    }

    async bidirectionalSync() {
        console.log('Bidirectional sync triggered');

        if (!this.isAuthenticated) {
            new Notice(t('pleaseLogin'));
            return;
        }

        if (!this.settings.repoOwner || !this.settings.repoName) {
            new Notice(t('pleaseConfigRepo'));
            return;
        }

        const client = this.authManager.getClient();
        if (!client) {
            new Notice(t('notAuthenticated'));
            return;
        }

        this.syncEngine.setClient(client);
        await this.syncEngine.bidirectionalSync();
    }
}

// 设置面板
class GitSyncSettingTab extends PluginSettingTab {
    plugin: GitSyncPlugin;

    constructor(app: App, plugin: GitSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: t('settingsTitle') });

        // 账户设置
        containerEl.createEl('h3', { text: t('account') });

        const authStatus = this.plugin.authManager.getAuthStatus();

        if (authStatus.isAuthenticated) {
            // 已登录状态
            new Setting(containerEl)
                .setName(t('loggedInAs'))
                .setDesc(authStatus.username || 'Unknown')
                .addButton(button => button
                    .setButtonText(t('logout'))
                    .onClick(async () => {
                        this.plugin.authManager.logout();
                        this.plugin.settings.githubToken = '';
                        this.plugin.settings.githubUsername = '';
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice(t('logoutSuccess'));
                    }));
        } else {
            // 未登录状态 - Token 输入
            let tokenInput = '';

            new Setting(containerEl)
                .setName(t('githubToken'))
                .setDesc(t('githubTokenDesc'))
                .addText(text => text
                    .setPlaceholder('ghp_xxx...')
                    .setValue('')
                    .onChange((value) => {
                        tokenInput = value;
                    }))
                .addButton(button => button
                    .setButtonText(t('login'))
                    .setCta()
                    .onClick(async () => {
                        if (!tokenInput) {
                            new Notice(t('pleaseLogin'));
                            return;
                        }

                        new Notice(t('verifyingToken'));

                        const success = await this.plugin.authManager.authenticateWithToken(tokenInput);
                        if (success) {
                            this.plugin.settings.githubToken = encryptToken(tokenInput);
                            await this.plugin.saveSettings();
                            this.display();
                            new Notice(t('loginSuccess'));
                        } else {
                            new Notice(t('invalidToken'));
                        }
                    }));

            // 创建 Token 链接
            containerEl.createEl('p', { text: t('createToken') });
            const link = containerEl.createEl('a', { text: t('githubTokenSettings') });
            link.href = 'https://github.com/settings/tokens/new?scopes=repo,user';
        }

        // 仓库设置
        containerEl.createEl('h3', { text: t('repository') });

        if (authStatus.isAuthenticated) {
            // 显示当前仓库
            if (this.plugin.settings.repoOwner && this.plugin.settings.repoName) {
                new Setting(containerEl)
                    .setName(t('currentRepository'))
                    .setDesc(`${this.plugin.settings.repoOwner}/${this.plugin.settings.repoName}`)
                    .addButton(button => button
                        .setButtonText(t('changeRepository'))
                        .onClick(() => {
                            const modal = new SelectRepoModal(
                                this.plugin.app,
                                this.plugin,
                                (repo: GitHubRepository) => {
                                    this.plugin.settings.repoOwner = repo.owner.login;
                                    this.plugin.settings.repoName = repo.name;
                                    this.plugin.saveSettings();
                                    this.display();
                                    new Notice(t('repoSelected') + repo.full_name);
                                }
                            );
                            modal.open();
                        }));
            } else {
                // 未配置仓库
                containerEl.createEl('p', {
                    text: t('noRepoConfigured'),
                    cls: 'setting-item-description'
                });

                new Setting(containerEl)
                    .setName(t('createNewRepo'))
                    .addButton(button => button
                        .setButtonText(t('create'))
                        .setCta()
                        .onClick(() => {
                            const modal = new CreateRepoModal(
                                this.plugin.app,
                                this.plugin,
                                (repo: GitHubRepository) => {
                                    this.plugin.settings.repoOwner = repo.owner.login;
                                    this.plugin.settings.repoName = repo.name;
                                    this.plugin.saveSettings();
                                    this.display();
                                    new Notice(t('repoCreated') + repo.full_name);
                                }
                            );
                            modal.open();
                        }));

                new Setting(containerEl)
                    .setName(t('selectExistingRepo'))
                    .addButton(button => button
                        .setButtonText(t('select'))
                        .onClick(() => {
                            const modal = new SelectRepoModal(
                                this.plugin.app,
                                this.plugin,
                                (repo: GitHubRepository) => {
                                    this.plugin.settings.repoOwner = repo.owner.login;
                                    this.plugin.settings.repoName = repo.name;
                                    this.plugin.saveSettings();
                                    this.display();
                                    new Notice(t('repoSelected') + repo.full_name);
                                }
                            );
                            modal.open();
                        }));
            }
        } else {
            containerEl.createEl('p', {
                text: t('pleaseLogin'),
                cls: 'setting-item-description'
            });
        }

        // 同步设置
        containerEl.createEl('h3', { text: t('syncSettings') });

        new Setting(containerEl)
            .setName(t('autoSync'))
            .setDesc(t('autoSyncDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('fileSizeLimit'))
            .setDesc(t('fileSizeLimitDesc'))
            .addText(text => text
                .setValue(String(this.plugin.settings.fileSizeLimit))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num <= 100) {
                        this.plugin.settings.fileSizeLimit = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName(t('syncOnStartup'))
            .setDesc(t('syncOnStartupDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));
    }
}
