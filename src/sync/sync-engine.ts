/**
 * 同步引擎 - 调度入口
 */

import { TFile, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { GitHubClient } from '../api/github';
import { SyncUploader } from './sync-upload';
import { SyncDownloader } from './sync-download';
import { SyncResult, createSyncResult, createErrorResult, getAllVaultFiles, isTempFileName } from './sync-utils';
import { t } from '../i18n';
import { logger } from '../utils/logger';

/**
 * 同步引擎
 */
export class SyncEngine {
    plugin: GitSyncPlugin;
    uploader: SyncUploader;
    downloader: SyncDownloader;
    client: GitHubClient | null = null;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
        this.uploader = new SyncUploader(plugin);
        this.downloader = new SyncDownloader(plugin);
    }

    /**
     * 设置 GitHub 客户端
     */
    setClient(client: GitHubClient): void {
        this.client = client;
        this.uploader.setClient(client);
        this.downloader.setClient(client);
    }

    /**
     * 获取下载状态标志
     */
    get isDownloading(): boolean {
        return this.downloader.isDownloading;
    }

    /**
     * 获取删除本地文件状态标志
     */
    get isDeletingLocalFiles(): boolean {
        return this.downloader.isDeletingLocalFiles;
    }

    /**
     * 全量同步：上传所有本地文件到 GitHub
     */
    async fullSync(): Promise<SyncResult> {
        return this.uploader.fullSync();
    }

    /**
     * 从远程全量拉取
     */
    async pullFromRemote(): Promise<SyncResult> {
        return this.downloader.pullFromRemote();
    }

    /**
     * 双向同步（先拉取远程变更，再推送本地变更）
     */
    async bidirectionalSync(): Promise<SyncResult> {
        if (!this.client) {
            return createErrorResult('Not authenticated');
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return createErrorResult(t('repoNotConfigured'));
        }

        // 开始同步
        if (this.plugin.statusBar) {
            this.plugin.statusBar.startSyncing();
        }

        new Notice(t('startingSync'));

        const result = createSyncResult();

        try {
            // 第一步：获取远程所有文件
            const remoteFiles = await this.client.getAllFiles(repoOwner, repoName);
            const remoteFileMap = new Map<string, { sha: string; path: string }>();
            for (const file of remoteFiles) {
                remoteFileMap.set(file.path, { sha: file.sha, path: file.path });
            }

            // 第二步：拉取远程变更（检测冲突）
            await this.pullRemoteChanges(remoteFiles, result);

            // 第三步：检查是否有冲突
            const conflicts = this.plugin.stateManager.getConflictFiles();
            if (conflicts.length > 0) {
                return this.handleConflicts(conflicts, result);
            }

            // 第四步：删除本地多余的文件
            await this.deleteLocalFiles(remoteFileMap, result);

            // 第五步：推送本地变更
            await this.pushLocalChanges(remoteFileMap, result);

            // 完成
            this.finishBidirectionalSync(result);
            return result;
        } catch (error) {
            logger.error('Bidirectional sync failed:', error);
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
            return createErrorResult(String(error));
        }
    }

    /**
     * 拉取远程变更
     */
    private async pullRemoteChanges(
        remoteFiles: Awaited<ReturnType<GitHubClient['getAllFiles']>>,
        result: SyncResult
    ): Promise<void> {
        const totalRemoteFiles = remoteFiles.length;
        let processedRemoteFiles = 0;

        for (const remoteFile of remoteFiles) {
            processedRemoteFiles++;

            // 更新进度
            if (this.plugin.statusBar) {
                this.plugin.statusBar.updateProgress(processedRemoteFiles, totalRemoteFiles, 'pull');
            }

            // 跳过特殊文件
            if (this.shouldSkipRemoteFile(remoteFile.path)) {
                result.skippedFiles++;
                continue;
            }

            // 检查排除规则
            if (this.uploader.shouldExcludeFile(remoteFile.path)) {
                result.skippedFiles++;
                continue;
            }

            // 下载文件（不强制覆盖，检测冲突）
            const success = await this.downloader.downloadFile(remoteFile.path, false, remoteFile.sha);
            if (success) {
                result.uploadedFiles++;
            }
        }
    }

    /**
     * 处理冲突
     */
    private handleConflicts(conflicts: string[], result: SyncResult): SyncResult {
        new Notice(t('conflictsPaused', { count: conflicts.length }));
        if (this.plugin.statusBar) {
            this.plugin.statusBar.setConflictCount(conflicts.length);
            this.plugin.statusBar.endSync(false);
        }
        return {
            ...result,
            errors: [...result.errors, `${conflicts.length} conflicts detected`]
        };
    }

    /**
     * 删除本地多余的文件
     */
    private async deleteLocalFiles(
        remoteFileMap: Map<string, { sha: string; path: string }>,
        result: SyncResult
    ): Promise<void> {
        const localFiles = getAllVaultFiles(this.plugin.app.vault);

        this.downloader.isDeletingLocalFiles = true;
        try {
            for (const localFile of localFiles) {
                // 跳过排除规则
                if (this.uploader.shouldExcludeFile(localFile.path)) {
                    continue;
                }

                // 跳过临时文件名
                if (isTempFileName(localFile.basename)) {
                    continue;
                }

                // 如果本地存在但远程不存在
                if (!remoteFileMap.has(localFile.path)) {
                    // 只删除曾经同步过的文件
                    const fileState = this.plugin.stateManager.getFileState(localFile.path);
                    if (fileState && fileState.status === 'synced') {
                        try {
                            await this.plugin.app.vault.delete(localFile);
                            result.deletedFiles++;
                            logger.debug('Deleted local file (remote deleted):', localFile.path);
                        } catch (error) {
                            result.errorFiles++;
                            result.errors.push(`Failed to delete local: ${localFile.path}`);
                        }
                    }
                }
            }
        } finally {
            this.downloader.isDeletingLocalFiles = false;
        }
    }

    /**
     * 推送本地变更
     */
    private async pushLocalChanges(
        remoteFileMap: Map<string, { sha: string; path: string }>,
        result: SyncResult
    ): Promise<void> {
        const currentLocalFiles = getAllVaultFiles(this.plugin.app.vault);
        let uploadCount = 0;
        let uploadErrorCount = 0;
        const totalLocalFiles = currentLocalFiles.length;
        let processedLocalFiles = 0;

        for (const localFile of currentLocalFiles) {
            processedLocalFiles++;

            // 更新进度
            if (this.plugin.statusBar) {
                this.plugin.statusBar.updateProgress(processedLocalFiles, totalLocalFiles, 'push');
            }

            // 跳过排除规则
            if (this.uploader.shouldExcludeFile(localFile.path)) {
                continue;
            }

            // 跳过临时文件名
            if (isTempFileName(localFile.basename)) {
                continue;
            }

            // 跳过大文件
            if (!this.uploader.isFileSizeOk(localFile.stat.size)) {
                continue;
            }

            // 获取远程 SHA
            const remoteInfo = remoteFileMap.get(localFile.path);
            const fileState = this.plugin.stateManager.getFileState(localFile.path);

            // 判断是否需要上传
            const needsUpload = !remoteInfo ||
                !fileState ||
                new Date(localFile.stat.mtime) > new Date(fileState.localModified);

            if (needsUpload) {
                const success = await this.uploader.uploadSingleFile(localFile, remoteInfo?.sha);
                if (success) {
                    uploadCount++;
                } else {
                    uploadErrorCount++;
                }
            }
        }

        // 合并结果
        result.uploadedFiles += uploadCount;
        result.errorFiles += uploadErrorCount;
    }

    /**
     * 完成双向同步
     */
    private finishBidirectionalSync(result: SyncResult): void {
        if (this.plugin.statusBar) {
            this.plugin.statusBar.endSync(result.errorFiles === 0);
        }

        const message = result.deletedFiles > 0
            ? t('pullWithDeletes', { downloaded: result.uploadedFiles, deleted: result.deletedFiles })
            : t('syncCompleted', { count: result.uploadedFiles });
        new Notice(message);
    }

    /**
     * 上传单个文件
     */
    async uploadSingleFile(file: TFile, knownRemoteSha?: string): Promise<boolean> {
        return this.uploader.uploadSingleFile(file, knownRemoteSha);
    }

    /**
     * 删除远程文件
     */
    async deleteRemoteFile(path: string): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return false;
        }

        try {
            const remoteSha = await this.client.getFileSha(repoOwner, repoName, path);

            if (!remoteSha) {
                return true;
            }

            const success = await this.client.deleteFile({
                owner: repoOwner,
                repo: repoName,
                path: path,
                message: `Delete ${path}`,
                sha: remoteSha
            });

            if (success) {
                logger.debug('Remote file deleted:', path);
            }

            return success;
        } catch (error) {
            logger.error('Failed to delete remote file:', path, error);
            return false;
        }
    }

    /**
     * 检查文件是否应该排除
     */
    shouldExcludeFile(path: string): boolean {
        return this.uploader.shouldExcludeFile(path);
    }

    /**
     * 检查文件大小是否超限
     */
    isFileSizeOk(size: number): boolean {
        return this.uploader.isFileSizeOk(size);
    }

    /**
     * 检查是否应该跳过远程文件
     */
    private shouldSkipRemoteFile(path: string): boolean {
        return this.downloader.shouldExcludeFile(path) ||
            path.startsWith('.git/') ||
            path === '.gitignore' ||
            path === 'README.md' ||
            path === 'LICENSE';
    }
}