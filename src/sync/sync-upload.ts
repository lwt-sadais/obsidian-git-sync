/**
 * 同步上传逻辑
 */

import { TFile, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { GitHubClient } from '../api/github';
import { SyncResult, createSyncResult, createErrorResult, getAllVaultFiles, isTempFileName, sleep } from './sync-utils';
import { arrayBufferToBase64 } from '../utils/encoding';
import { BATCH_PAUSE_THRESHOLD, BATCH_PAUSE_MS, MB_TO_BYTES } from '../constants';
import { t } from '../i18n';
import { logger } from '../utils/logger';

/**
 * 同步上传处理器
 */
export class SyncUploader {
    plugin: GitSyncPlugin;
    client: GitHubClient | null = null;

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
     * 全量同步：上传所有本地文件到 GitHub
     */
    async fullSync(): Promise<SyncResult> {
        if (!this.client) {
            return createErrorResult('Not authenticated');
        }

        const { repoOwner, repoName, fileSizeLimit, excludedPaths, excludedExtensions } = this.plugin.settings;

        if (!repoOwner || !repoName) {
            return createErrorResult(t('repoNotConfigured'));
        }

        // 开始同步 - 更新状态栏
        if (this.plugin.statusBar) {
            this.plugin.statusBar.startSyncing();
        }

        new Notice(t('startingSync'));

        const result = createSyncResult();

        // 先获取远程所有文件的 SHA 映射（减少后续 API 调用）
        const remoteFileMap = await this.fetchRemoteFileMap(repoOwner, repoName);

        // 获取并过滤本地文件
        const allFiles = getAllVaultFiles(this.plugin.app.vault);
        const filteredFiles = this.filterFiles(allFiles, excludedPaths, excludedExtensions, result);

        // 检查文件大小并上传
        const sizeLimitBytes = fileSizeLimit * MB_TO_BYTES;
        const totalFiles = filteredFiles.length;
        let processedFiles = 0;

        for (const file of filteredFiles) {
            processedFiles++;

            // 更新状态栏进度
            if (this.plugin.statusBar) {
                this.plugin.statusBar.updateProgress(processedFiles, totalFiles, 'push');
            }

            // 检查文件大小
            if (file.stat.size > sizeLimitBytes) {
                result.skippedFiles++;
                result.errors.push(`File too large: ${file.path} (${Math.round(file.stat.size / 1024 / 1024)}MB)`);
                continue;
            }

            // 上传文件
            await this.uploadFile(file, repoOwner, repoName, remoteFileMap, result);

            // 避免触发 GitHub API 限流
            if (processedFiles % BATCH_PAUSE_THRESHOLD === 0) {
                await sleep(BATCH_PAUSE_MS);
            }
        }

        this.finishSync(result, totalFiles);
        return result;
    }

    /**
     * 上传单个文件
     */
    async uploadSingleFile(file: TFile, knownRemoteSha?: string): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return false;
        }

        // 检查排除规则
        if (this.shouldExcludeFile(file.path)) {
            return false;
        }

        // 检查是否为临时文件名
        if (isTempFileName(file.basename)) {
            return false;
        }

        // 检查文件大小
        if (!this.isFileSizeOk(file.stat.size)) {
            return false;
        }

        try {
            const content = await this.plugin.app.vault.readBinary(file);
            const base64Content = arrayBufferToBase64(content);

            // 获取文件状态，判断是否为新增文件
            const fileState = this.plugin.stateManager.getFileState(file.path);
            const isNewFile = !fileState || !fileState.remoteSha;

            let sha: string | undefined;

            if (isNewFile) {
                // 新增文件：直接上传不带 SHA
                sha = undefined;
            } else {
                // 更新文件：优先使用传入的 SHA，其次使用缓存 SHA
                sha = knownRemoteSha ?? fileState?.remoteSha;
            }

            const uploadResult = await this.client.uploadFile({
                owner: repoOwner,
                repo: repoName,
                path: file.path,
                message: sha ? `Update ${file.path}` : `Upload ${file.path}`,
                content: base64Content,
                sha: sha
            });

            if (uploadResult) {
                await this.plugin.stateManager.updateFileSynced(
                    file.path,
                    uploadResult.sha,
                    new Date(file.stat.mtime).toISOString()
                );
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Failed to upload file:', file.path, error);
            return false;
        }
    }

    /**
     * 获取远程文件映射
     */
    private async fetchRemoteFileMap(owner: string, repo: string): Promise<Map<string, { sha: string }>> {
        const remoteFileMap = new Map<string, { sha: string }>();
        try {
            const remoteFiles = await this.client!.getAllFiles(owner, repo);
            for (const file of remoteFiles) {
                remoteFileMap.set(file.path, { sha: file.sha });
            }
        } catch (error) {
            logger.warn('Failed to get remote files, will upload without SHA check:', error);
        }
        return remoteFileMap;
    }

    /**
     * 过滤文件
     */
    private filterFiles(
        files: TFile[],
        excludedPaths: string[],
        excludedExtensions: string[],
        result: SyncResult
    ): TFile[] {
        return files.filter(file => {
            // 检查排除路径
            for (const excludedPath of excludedPaths) {
                if (file.path.startsWith(excludedPath)) {
                    result.skippedFiles++;
                    return false;
                }
            }

            // 检查排除扩展名
            if (excludedExtensions.includes(file.extension)) {
                result.skippedFiles++;
                return false;
            }

            // 检查是否为临时文件名
            if (isTempFileName(file.basename)) {
                result.skippedFiles++;
                return false;
            }

            return true;
        });
    }

    /**
     * 上传文件
     */
    private async uploadFile(
        file: TFile,
        owner: string,
        repo: string,
        remoteFileMap: Map<string, { sha: string }>,
        result: SyncResult
    ): Promise<void> {
        try {
            const content = await this.plugin.app.vault.readBinary(file);
            const base64Content = arrayBufferToBase64(content);

            const uploadResult = await this.client!.uploadFile({
                owner,
                repo,
                path: file.path,
                message: `Upload ${file.path}`,
                content: base64Content,
                sha: remoteFileMap.get(file.path)?.sha
            });

            if (uploadResult) {
                result.uploadedFiles++;
                await this.plugin.stateManager.updateFileSynced(
                    file.path,
                    uploadResult.sha,
                    new Date(file.stat.mtime).toISOString()
                );
            } else {
                result.errorFiles++;
                result.errors.push(`Failed to upload: ${file.path}`);
            }
        } catch (error) {
            result.errorFiles++;
            result.errors.push(`Error uploading ${file.path}: ${error}`);
        }
    }

    /**
     * 完成同步
     */
    private finishSync(result: SyncResult, totalFiles: number): void {
        if (result.uploadedFiles === totalFiles - result.skippedFiles) {
            new Notice(t('syncCompleted', { count: result.uploadedFiles }));
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(true);
            }
        } else {
            new Notice(t('syncWithErrors', { uploaded: result.uploadedFiles, errors: result.errorFiles }));
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
        }
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

    /**
     * 检查文件大小是否超限
     */
    isFileSizeOk(size: number): boolean {
        const limitBytes = this.plugin.settings.fileSizeLimit * MB_TO_BYTES;
        return size <= limitBytes;
    }
}