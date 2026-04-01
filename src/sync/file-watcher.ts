/**
 * 文件监听器
 */

import { TFile, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { isTempFileName, getFileNameFromPath } from './sync-utils';
import { FILE_CHANGE_DEBOUNCE_MS } from '../constants';
import { t } from '../i18n';
import { logger } from '../utils/logger';

/**
 * 延迟操作类型
 */
interface DeferredOperation {
    type: 'delete' | 'modify' | 'rename';
    path: string;
    oldPath?: string;
    file?: TFile;
    timestamp: number;
}

/**
 * 删除队列项
 */
interface DeleteQueueItem {
    path: string;
    timestamp: number;
}

/**
 * 文件监听器
 */
export class FileWatcher {
    plugin: GitSyncPlugin;

    /** 文件变更 debounce 定时器 */
    fileChangeTimer: ReturnType<typeof setTimeout> | null = null;

    /** 延迟操作队列 */
    deferredOperations: DeferredOperation[] = [];

    /** 删除队列 */
    deleteQueue: DeleteQueueItem[] = [];

    /** 删除操作 debounce 定时器 */
    deleteTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
    }

    /**
     * 清理定时器
     */
    cleanup(): void {
        if (this.fileChangeTimer) {
            clearTimeout(this.fileChangeTimer);
            this.fileChangeTimer = null;
        }
        if (this.deleteTimer) {
            clearTimeout(this.deleteTimer);
            this.deleteTimer = null;
        }
    }

    /**
     * 处理文件变更
     */
    handleFileChange(file: TFile): void {
        // 检查是否应该同步
        if (!this.shouldSyncFile(file)) {
            return;
        }

        // 防止循环：下载期间抑制 modify/create 事件
        if (this.plugin.operationManager.shouldSuppressModify()) {
            this.addDeferredOperation({
                type: 'modify',
                path: file.path,
                file: file,
                timestamp: Date.now()
            });
            return;
        }

        // 获取当前操作状态
        const currentOp = this.plugin.operationManager.getCurrentOperation();

        // 有阻塞操作正在运行时，加入延迟队列
        if (currentOp.isBlocking) {
            this.addDeferredOperation({
                type: 'modify',
                path: file.path,
                file: file,
                timestamp: Date.now()
            });
            return;
        }

        // 正常文件，直接加入同步队列
        this.addToSyncQueue(file);
    }

    /**
     * 处理文件删除
     */
    handleFileDelete(file: TFile): void {
        // 防止循环：删除本地文件期间抑制 delete 事件
        if (this.plugin.operationManager.shouldSuppressDelete()) {
            return;
        }

        if (!this.plugin.settings.autoSync || !this.plugin.isAuthenticated) {
            return;
        }

        const isTempFile = isTempFileName(file.basename);
        const isExcluded = this.plugin.syncEngine.shouldExcludeFile(file.path);

        // 清除文件状态
        this.plugin.stateManager.clearFileState(file.path);

        // 获取当前操作状态
        const currentOp = this.plugin.operationManager.getCurrentOperation();

        // 有阻塞操作正在运行时，加入延迟队列
        if (currentOp.isBlocking) {
            if (!isTempFile && !isExcluded) {
                this.addDeferredOperation({
                    type: 'delete',
                    path: file.path,
                    timestamp: Date.now()
                });
            }
            return;
        }

        // 如果不是临时文件且不在排除规则中，加入删除队列
        if (!isTempFile && !isExcluded) {
            this.addToDeleteQueue(file.path);
        }

        // 更新状态栏
        const pendingCount = this.plugin.stateManager.getPendingFiles().length;
        this.plugin.statusBar.setPendingCount(pendingCount);
    }

    /**
     * 处理文件重命名
     */
    handleFileRename(file: TFile, oldPath: string): void {
        if (!this.plugin.settings.autoSync || !this.plugin.isAuthenticated) {
            return;
        }

        // 清除旧文件状态
        this.plugin.stateManager.clearFileState(oldPath);

        const wasTempFile = isTempFileName(getFileNameFromPath(oldPath));
        const isTempFile = isTempFileName(file.basename);
        const isOldExcluded = this.plugin.syncEngine.shouldExcludeFile(oldPath);
        const isNewExcluded = this.plugin.syncEngine.shouldExcludeFile(file.path);

        // 获取当前操作状态
        const currentOp = this.plugin.operationManager.getCurrentOperation();

        // 有阻塞操作正在运行时，加入延迟队列
        if (currentOp.isBlocking) {
            if (!wasTempFile && !isOldExcluded) {
                this.addDeferredOperation({
                    type: 'rename',
                    path: file.path,
                    oldPath: oldPath,
                    file: file,
                    timestamp: Date.now()
                });
            }
            return;
        }

        // 如果旧路径不是临时文件，删除远程旧路径文件
        if (!wasTempFile && !isOldExcluded) {
            this.deleteRemoteFile(oldPath);
        }

        // 新名称是临时名称，跳过
        if (isTempFile) {
            return;
        }

        // 新名称不是临时名称，添加到同步队列
        if (!isNewExcluded) {
            this.addToSyncQueue(file);
        }
    }

    /**
     * 同步待同步文件
     */
    async syncPendingFiles(): Promise<void> {
        // 检查是否可以启动操作
        if (!this.plugin.operationManager.canStart('upload_batch')) {
            return;
        }

        if (!this.plugin.isAuthenticated || !this.plugin.settings.repoOwner || !this.plugin.settings.repoName) {
            return;
        }

        const client = this.plugin.authManager.getClient();
        if (!client) {
            return;
        }

        this.plugin.syncEngine.setClient(client);

        const filesToSync = this.plugin.stateManager.getPendingFiles();
        if (filesToSync.length === 0) {
            return;
        }

        this.plugin.operationManager.start('upload_batch');
        this.plugin.statusBar.startSyncing();

        const totalFiles = filesToSync.length;
        let processedFiles = 0;
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const filePath of filesToSync) {
                processedFiles++;

                // 更新状态栏进度
                this.plugin.statusBar.updateProgress(processedFiles, totalFiles, 'push');

                // 更新操作进度
                this.plugin.operationManager.updateProgress(processedFiles, totalFiles, 'push');

                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const fileState = this.plugin.stateManager.getFileState(filePath);
                    const success = await this.plugin.syncEngine.uploadSingleFile(file, fileState?.remoteSha);
                    if (success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } else {
                    this.plugin.stateManager.clearFileState(filePath);
                }
            }
        } finally {
            this.plugin.operationManager.end();
        }

        this.plugin.statusBar.endSync(errorCount === 0);

        if (successCount > 0) {
            new Notice(t('syncedFiles', { count: successCount }));
        }

        const pendingCount = this.plugin.stateManager.getPendingFiles().length;
        this.plugin.statusBar.setPendingCount(pendingCount);

        await this.processDeferredOperations();
    }

    /**
     * 处理延迟操作队列
     */
    async processDeferredOperations(): Promise<void> {
        if (this.deferredOperations.length === 0) {
            return;
        }

        logger.debug('Processing deferred operations:', this.deferredOperations.length);

        const operations = [...this.deferredOperations];
        this.deferredOperations = [];

        operations.sort((a, b) => a.timestamp - b.timestamp);

        for (const op of operations) {
            try {
                await this.executeDeferredOperation(op);
            } catch (error) {
                logger.error('Failed to process deferred operation:', op, error);
            }
        }

        logger.debug('Deferred operations processed');
    }

    /**
     * 检查是否应该同步文件
     */
    private shouldSyncFile(file: TFile): boolean {
        return this.plugin.settings.autoSync &&
               this.plugin.isAuthenticated &&
               !this.plugin.syncEngine.shouldExcludeFile(file.path) &&
               this.plugin.syncEngine.isFileSizeOk(file.stat.size) &&
               !isTempFileName(file.basename);
    }

    /**
     * 添加到同步队列
     */
    private addToSyncQueue(file: TFile): void {
        this.plugin.stateManager.markFilePending(file.path, new Date(file.stat.mtime).toISOString());

        const pendingCount = this.plugin.stateManager.getPendingFiles().length;
        this.plugin.statusBar.setPendingCount(pendingCount);

        if (this.fileChangeTimer) {
            clearTimeout(this.fileChangeTimer);
        }

        this.fileChangeTimer = setTimeout(() => {
            this.syncPendingFiles();
        }, FILE_CHANGE_DEBOUNCE_MS);
    }

    /**
     * 添加延迟操作到队列
     */
    private addDeferredOperation(operation: DeferredOperation): void {
        const existingIndex = this.deferredOperations.findIndex(op => op.path === operation.path);
        if (existingIndex >= 0) {
            if (operation.type === 'delete') {
                this.deferredOperations[existingIndex] = operation;
            } else if (operation.type === 'modify' && this.deferredOperations[existingIndex].type !== 'delete') {
                this.deferredOperations[existingIndex] = operation;
            }
        } else {
            this.deferredOperations.push(operation);
        }
        logger.debug('Deferred operation added:', operation.type, operation.path);
    }

    /**
     * 执行延迟操作
     */
    private async executeDeferredOperation(op: DeferredOperation): Promise<void> {
        switch (op.type) {
            case 'delete':
                await this.deleteRemoteFile(op.path);
                break;

            case 'modify': {
                const file = this.plugin.app.vault.getAbstractFileByPath(op.path);
                if (!(file instanceof TFile)) break;

                const fileState = this.plugin.stateManager.getFileState(op.path);
                const localModified = new Date(file.stat.mtime);
                if (fileState && localModified <= new Date(fileState.localModified)) {
                    logger.debug('Skipping deferred modify, already synced:', op.path);
                    break;
                }

                await this.plugin.syncEngine.uploadSingleFile(file, fileState?.remoteSha);
                break;
            }

            case 'rename': {
                if (op.oldPath) {
                    await this.deleteRemoteFile(op.oldPath);
                }
                const file = this.plugin.app.vault.getAbstractFileByPath(op.path);
                if (file instanceof TFile) {
                    const fileState = this.plugin.stateManager.getFileState(op.path);
                    await this.plugin.syncEngine.uploadSingleFile(file, fileState?.remoteSha);
                }
                break;
            }
        }
    }

    /**
     * 添加到删除队列
     */
    private addToDeleteQueue(path: string): void {
        // 避免重复添加
        if (this.deleteQueue.some(item => item.path === path)) {
            return;
        }

        this.deleteQueue.push({ path, timestamp: Date.now() });

        // 更新状态栏显示待删除数量
        const deleteCount = this.deleteQueue.length;
        this.plugin.statusBar.setStatus('pending', `${deleteCount} ${t('statusPending').toLowerCase()}`);

        // 设置定时器，批量处理删除队列
        if (this.deleteTimer) {
            clearTimeout(this.deleteTimer);
        }

        this.deleteTimer = setTimeout(() => {
            this.processDeleteQueue();
        }, FILE_CHANGE_DEBOUNCE_MS);
    }

    /**
     * 处理删除队列
     */
    private async processDeleteQueue(): Promise<void> {
        if (this.deleteQueue.length === 0) {
            return;
        }

        if (!this.plugin.isAuthenticated || !this.plugin.settings.repoOwner || !this.plugin.settings.repoName) {
            this.deleteQueue = [];
            return;
        }

        const client = this.plugin.authManager.getClient();
        if (!client) {
            this.deleteQueue = [];
            return;
        }

        this.plugin.syncEngine.setClient(client);

        const filesToDelete = [...this.deleteQueue];
        this.deleteQueue = [];

        this.plugin.statusBar.startSyncing();

        const totalFiles = filesToDelete.length;
        let processedFiles = 0;
        let successCount = 0;

        for (const item of filesToDelete) {
            processedFiles++;

            // 更新状态栏进度
            this.plugin.statusBar.updateProgress(processedFiles, totalFiles, 'pull');

            const success = await this.plugin.syncEngine.deleteRemoteFile(item.path);
            if (success) {
                successCount++;
            }
        }

        this.plugin.statusBar.endSync(successCount === totalFiles);

        if (successCount > 0) {
            new Notice(t('deletedFromRemote', { path: `${successCount} files` }));
        }

        // 处理延迟操作
        await this.processDeferredOperations();
    }

    /**
     * 删除远程文件
     */
    private async deleteRemoteFile(path: string): Promise<void> {
        if (!this.plugin.isAuthenticated || !this.plugin.settings.repoOwner || !this.plugin.settings.repoName) {
            return;
        }

        const client = this.plugin.authManager.getClient();
        if (!client) {
            return;
        }

        this.plugin.syncEngine.setClient(client);
        const success = await this.plugin.syncEngine.deleteRemoteFile(path);

        if (success) {
            new Notice(t('deletedFromRemote', { path }));
        }
    }
}