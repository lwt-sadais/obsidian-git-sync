/**
 * 同步下载逻辑
 */

import { TFile, TFolder, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { GitHubClient } from '../api/github';
import { GitHubFile } from '../api/types';
import { SyncResult, createSyncResult, createErrorResult, getAllVaultFiles, isTempFileName, sleep } from './sync-utils';
import { base64ToArrayBuffer } from '../utils/encoding';
import { BATCH_PAUSE_THRESHOLD, BATCH_PAUSE_MS, REMOTE_SKIP_FILES, REMOTE_SKIP_PREFIXES } from '../constants';
import { t } from '../i18n';

/**
 * 同步下载处理器
 */
export class SyncDownloader {
    plugin: GitSyncPlugin;
    client: GitHubClient | null = null;
    isDownloading: boolean = false;
    isDeletingLocalFiles: boolean = false;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
    }

    /**
     * 设置 GitHub 客户端
     */
    setClient(client: GitHubClient): void {
        this.client = client;
    }

    /**
     * 从远程全量拉取
     */
    async pullFromRemote(): Promise<SyncResult> {
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

        new Notice(t('startingSync') + '...');

        const result = createSyncResult();

        try {
            // 获取远程所有文件
            const remoteFiles = await this.client.getAllFiles(repoOwner, repoName);
            const remoteFilePaths = new Set(remoteFiles.map(f => f.path));

            // 下载远程文件
            await this.downloadRemoteFiles(remoteFiles, repoOwner, repoName, result);

            // 删除本地多余的文件
            await this.deleteLocalFiles(remoteFilePaths, result);

            // 完成
            this.finishPull(result);
            return result;
        } catch (error) {
            console.error('Pull failed:', error);
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
            return createErrorResult(String(error));
        }
    }

    /**
     * 从远程拉取单个文件
     */
    async downloadFile(path: string, forceOverwrite: boolean = false, blobSha?: string): Promise<boolean> {
        if (!this.client) {
            console.error('Not authenticated');
            return false;
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            console.error('Repository not configured');
            return false;
        }

        try {
            // 获取远程文件
            const remoteFile = await this.client.getFile({
                owner: repoOwner,
                repo: repoName,
                path: path
            }, blobSha);

            if (!remoteFile || !remoteFile.content) {
                console.log('Remote file not found:', path);
                return false;
            }

            // 解码 Base64 内容
            const content = base64ToArrayBuffer(remoteFile.content);

            // 获取本地文件
            const localFile = this.plugin.app.vault.getAbstractFileByPath(path);

            if (localFile instanceof TFile) {
                // 本地文件存在
                if (!forceOverwrite) {
                    // 非强制模式，检查是否需要更新
                    const localModified = new Date(localFile.stat.mtime);
                    const fileState = this.plugin.stateManager.getFileState(path);

                    // 如果本地修改时间晚于同步记录，可能存在冲突
                    if (fileState && localModified > new Date(fileState.localModified)) {
                        await this.plugin.stateManager.markFileConflict(path, localModified.toISOString());
                        if (this.plugin.statusBar) {
                            this.plugin.statusBar.setConflictCount(
                                this.plugin.stateManager.getConflictFiles().length
                            );
                        }
                        new Notice(t('conflictDetected', { path }));
                        return false;
                    }
                }

                // 更新本地文件
                this.isDownloading = true;
                try {
                    await this.plugin.app.vault.modifyBinary(localFile, content);
                } finally {
                    this.isDownloading = false;
                }
            } else {
                // 本地文件不存在，创建新文件
                this.isDownloading = true;
                try {
                    const parentPath = path.substring(0, path.lastIndexOf('/'));
                    if (parentPath) {
                        await this.ensureFolderExists(parentPath);
                    }
                    await this.plugin.app.vault.createBinary(path, content);
                } finally {
                    this.isDownloading = false;
                }
            }

            // 更新状态
            await this.plugin.stateManager.updateFileSynced(
                path,
                remoteFile.sha,
                new Date().toISOString()
            );

            return true;
        } catch (error) {
            console.error('Failed to download file:', path, error);
            new Notice(t('downloadFailed', { path }));
            return false;
        }
    }

    /**
     * 下载远程文件
     */
    private async downloadRemoteFiles(
        remoteFiles: GitHubFile[],
        owner: string,
        repo: string,
        result: SyncResult
    ): Promise<void> {
        const totalFiles = remoteFiles.length;
        let processedFiles = 0;

        for (const remoteFile of remoteFiles) {
            processedFiles++;

            // 更新状态栏进度
            if (this.plugin.statusBar) {
                this.plugin.statusBar.updateProgress(processedFiles, totalFiles, 'pull');
            }

            // 跳过特殊文件
            if (this.shouldSkipRemoteFile(remoteFile.path)) {
                result.skippedFiles++;
                continue;
            }

            // 检查排除规则
            if (this.shouldExcludeFile(remoteFile.path)) {
                result.skippedFiles++;
                continue;
            }

            // 下载文件
            const success = await this.downloadFile(remoteFile.path, true, remoteFile.sha);
            if (success) {
                result.uploadedFiles++;
            } else {
                result.errorFiles++;
                result.errors.push(`Failed to download: ${remoteFile.path}`);
            }

            // 避免 API 限流
            if (processedFiles % BATCH_PAUSE_THRESHOLD === 0) {
                await sleep(BATCH_PAUSE_MS);
            }
        }
    }

    /**
     * 删除本地多余的文件
     */
    private async deleteLocalFiles(
        remoteFilePaths: Set<string>,
        result: SyncResult
    ): Promise<void> {
        const localFiles = getAllVaultFiles(this.plugin.app.vault);

        this.isDeletingLocalFiles = true;
        try {
            for (const localFile of localFiles) {
                // 跳过排除规则
                if (this.shouldExcludeFile(localFile.path)) {
                    continue;
                }

                // 跳过临时文件名
                if (isTempFileName(localFile.basename)) {
                    continue;
                }

                // 如果本地存在但远程不存在，删除本地文件
                if (!remoteFilePaths.has(localFile.path)) {
                    try {
                        await this.plugin.app.vault.delete(localFile);
                        result.deletedFiles++;
                        console.log('Deleted local file (remote deleted):', localFile.path);
                    } catch (error) {
                        result.errorFiles++;
                        result.errors.push(`Failed to delete local: ${localFile.path}`);
                    }
                }
            }
        } finally {
            this.isDeletingLocalFiles = false;
        }
    }

    /**
     * 确保目录存在（递归创建）
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) {
            return;
        }

        // 递归创建父目录
        const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
        if (parentPath) {
            await this.ensureFolderExists(parentPath);
        }

        // 创建当前目录
        await this.plugin.app.vault.createFolder(folderPath);
    }

    /**
     * 完成拉取
     */
    private finishPull(result: SyncResult): void {
        if (this.plugin.statusBar) {
            this.plugin.statusBar.endSync(result.errorFiles === 0);
        }

        const message = result.deletedFiles > 0
            ? t('pullWithDeletes', { downloaded: result.uploadedFiles, deleted: result.deletedFiles })
            : t('pullCompleted', { count: result.uploadedFiles });
        new Notice(message);
    }

    /**
     * 检查是否应该跳过远程文件
     */
    private shouldSkipRemoteFile(path: string): boolean {
        // 跳过特定目录前缀
        for (const prefix of REMOTE_SKIP_PREFIXES) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }

        // 跳过特定文件
        return REMOTE_SKIP_FILES.includes(path as any);
    }

    /**
     * 检查文件是否应该排除
     */
    shouldExcludeFile(path: string): boolean {
        const { excludedPaths, excludedExtensions } = this.plugin.settings;

        for (const excludedPath of excludedPaths) {
            if (path.startsWith(excludedPath)) {
                return true;
            }
        }

        const ext = path.split('.').pop() || '';
        return excludedExtensions.includes(ext);
    }
}