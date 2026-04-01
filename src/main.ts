/**
 * Git Sync 插件入口
 */

import { Plugin, TFile } from 'obsidian';
import { AuthManager } from './auth/auth-manager';
import { decryptToken, isEncrypted } from './auth/encryption';
import { AuthStatus } from './api/types';
import { GitHubClient } from './api/github';
import { RepoManager } from './ui/repo-manager';
import { SyncEngine } from './sync/sync-engine';
import { StateManager } from './sync/state-manager';
import { FileWatcher } from './sync/file-watcher';
import { StatusBarManager } from './ui/status-bar';
import { GitSyncSettingTab } from './settings';
import { GitSyncSettings, DEFAULT_SETTINGS } from './settings';
import { STARTUP_SYNC_DELAY_MS } from './constants';
import { t } from './i18n';

/**
 * Git Sync 插件
 */
export default class GitSyncPlugin extends Plugin {
    settings: GitSyncSettings;
    authManager: AuthManager;
    repoManager: RepoManager;
    syncEngine: SyncEngine;
    stateManager: StateManager;
    statusBar: StatusBarManager;
    fileWatcher: FileWatcher;
    isAuthenticated: boolean = false;
    isSyncing: boolean = false;

    async onload(): Promise<void> {
        await this.loadSettings();

        // 初始化组件
        this.authManager = new AuthManager();
        this.repoManager = new RepoManager(this);
        this.syncEngine = new SyncEngine(this);
        this.stateManager = new StateManager(this);
        this.fileWatcher = new FileWatcher(this);

        await this.stateManager.loadState();

        // 设置认证状态变更回调
        this.authManager.setOnAuthChange((status: AuthStatus) => {
            this.isAuthenticated = status.isAuthenticated;
            if (status.username) {
                this.settings.githubUsername = status.username;
                this.saveSettings();
            }
        });

        // 尝试使用保存的 Token 自动认证
        await this.tryAutoAuthenticate();

        // 注册设置面板
        this.addSettingTab(new GitSyncSettingTab(this.app, this));

        // 注册命令
        this.registerCommands();

        // 注册状态栏
        this.statusBar = new StatusBarManager(this);
        this.statusBar.setStatus(this.isAuthenticated ? 'synced' : 'offline');

        // 注册文件变更监听
        this.registerFileWatcher();

        // 启动时同步
        this.maybeSyncOnStartup();

        console.log('Git Sync plugin loaded');
    }

    onunload(): void {
        this.fileWatcher.cleanup();
        console.log('Git Sync plugin unloaded');
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * 尝试自动认证
     */
    private async tryAutoAuthenticate(): Promise<void> {
        if (!this.settings.githubToken) {
            return;
        }

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

    /**
     * 注册命令
     */
    private registerCommands(): void {
        this.addCommand({
            id: 'sync-now',
            name: t('cmdSyncNow'),
            callback: () => this.syncNow()
        });

        this.addCommand({
            id: 'pull-from-remote',
            name: t('cmdPullFromRemote'),
            callback: () => this.pullFromRemote()
        });

        this.addCommand({
            id: 'full-sync',
            name: t('cmdPushToRemote'),
            callback: () => this.fullSync()
        });
    }

    /**
     * 注册文件监听
     */
    private registerFileWatcher(): void {
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.fileWatcher.handleFileChange(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.fileWatcher.handleFileChange(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.fileWatcher.handleFileDelete(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.fileWatcher.handleFileRename(file, oldPath);
                }
            })
        );
    }

    /**
     * 启动时同步
     */
    private maybeSyncOnStartup(): void {
        if (this.settings.syncOnStartup && this.isAuthenticated && this.settings.repoOwner && this.settings.repoName) {
            setTimeout(() => {
                this.bidirectionalSync();
            }, STARTUP_SYNC_DELAY_MS);
        }
    }

    /**
     * 检查同步前置条件
     */
    private ensureSyncReady(): GitHubClient | null {
        if (!this.isAuthenticated) {
            this.statusBar?.setStatus('offline');
            return null;
        }

        if (!this.settings.repoOwner || !this.settings.repoName) {
            return null;
        }

        const client = this.authManager.getClient();
        if (!client) {
            return null;
        }

        return client;
    }

    /**
     * 立即同步
     */
    async syncNow(): Promise<void> {
        await this.bidirectionalSync();
    }

    /**
     * 全量同步（以本地为准）
     */
    async fullSync(): Promise<void> {
        const client = this.ensureSyncReady();
        if (!client) return;

        this.syncEngine.setClient(client);
        this.isSyncing = true;
        try {
            await this.syncEngine.fullSync();
        } finally {
            this.isSyncing = false;
            await this.fileWatcher.processDeferredOperations();
        }
    }

    /**
     * 从远程拉取（以远程为准）
     */
    async pullFromRemote(): Promise<void> {
        const client = this.ensureSyncReady();
        if (!client) return;

        this.syncEngine.setClient(client);
        this.isSyncing = true;
        try {
            await this.syncEngine.pullFromRemote();
        } finally {
            this.isSyncing = false;
            await this.fileWatcher.processDeferredOperations();
        }
    }

    /**
     * 双向同步
     */
    async bidirectionalSync(): Promise<void> {
        const client = this.ensureSyncReady();
        if (!client) return;

        this.syncEngine.setClient(client);
        this.isSyncing = true;
        try {
            await this.syncEngine.bidirectionalSync();
        } finally {
            this.isSyncing = false;
            await this.fileWatcher.processDeferredOperations();
        }
    }
}