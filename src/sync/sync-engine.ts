import { Vault, TFile, TFolder, Notice } from 'obsidian';
import { GitHubClient } from '../api/github';
import { GitHubFile } from '../api/types';
import GitSyncPlugin from '../main';
import { t } from '../i18n';

// 临时文件名列表（新建笔记时的默认名称，需要过滤）
export const TEMP_FILE_NAMES = [
    '未命名',
    'Untitled',
    'Untitled-1',
    'Untitled-2',
    'Untitled-3',
    'New note',
    '新笔记'
];

// 检查是否为临时文件名
export function isTempFileName(fileName: string): boolean {
    return TEMP_FILE_NAMES.some(tempName =>
        fileName === tempName || fileName.startsWith(tempName + '-')
    );
}

// 同步结果
export interface SyncResult {
    success: boolean;
    uploadedFiles: number;
    skippedFiles: number;
    errorFiles: number;
    deletedFiles: number;
    errors: string[];
}

export class SyncEngine {
    plugin: GitSyncPlugin;
    vault: Vault;
    client: GitHubClient | null = null;
    isDownloading: boolean = false;
    isDeletingLocalFiles: boolean = false;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
        this.vault = plugin.app.vault;
    }

    // 设置 GitHub 客户端
    setClient(client: GitHubClient) {
        this.client = client;
    }

    // 全量同步：上传所有本地文件到 GitHub
    async fullSync(): Promise<SyncResult> {
        if (!this.client) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: ['Not authenticated']
            };
        }

        const { repoOwner, repoName, fileSizeLimit, excludedPaths, excludedExtensions } = this.plugin.settings;

        if (!repoOwner || !repoName) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: [t('repoNotConfigured')]
            };
        }

        // 开始同步 - 更新状态栏
        if (this.plugin.statusBar) {
            this.plugin.statusBar.startSyncing();
        }

        new Notice(t('startingSync'));
        console.log('Starting full sync...');

        const result: SyncResult = {
            success: true,
            uploadedFiles: 0,
            skippedFiles: 0,
            errorFiles: 0,
            deletedFiles: 0,
            errors: []
        };

        // 先获取远程所有文件的 SHA 映射（减少后续 API 调用）
        let remoteFileMap = new Map<string, { sha: string }>();
        try {
            const remoteFiles = await this.client.getAllFiles(repoOwner, repoName);
            for (const file of remoteFiles) {
                remoteFileMap.set(file.path, { sha: file.sha });
            }
        } catch (error) {
            console.warn('Failed to get remote files, will upload without SHA check:', error);
        }

        // 获取所有文件
        const allFiles = this.getAllFiles();

        // 过滤文件
        const filteredFiles = allFiles.filter(file => {
            // 检查排除路径
            for (const excludedPath of excludedPaths) {
                if (file.path.startsWith(excludedPath)) {
                    result.skippedFiles++;
                    return false;
                }
            }

            // 检查排除扩展名
            const ext = file.extension;
            if (excludedExtensions.includes(ext)) {
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

        // 检查文件大小并上传
        const sizeLimitBytes = fileSizeLimit * 1024 * 1024;
        const totalFiles = filteredFiles.length;

        let processedFiles = 0;

        for (const file of filteredFiles) {
            processedFiles++;

            // 更新状态栏进度（每个文件都更新）
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
            try {
                const content = await this.vault.readBinary(file);
                const base64Content = this.arrayBufferToBase64(content);

                // 使用已有的远程 SHA 映射（减少 API 调用）
                const uploadResult = await this.client.uploadFile({
                    owner: repoOwner,
                    repo: repoName,
                    path: file.path,
                    message: `Upload ${file.path}`,
                    content: base64Content,
                    sha: remoteFileMap.get(file.path)?.sha
                });

                if (uploadResult) {
                    result.uploadedFiles++;
                    // 保存文件同步状态
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

            // 避免触发 GitHub API 限流，每上传 5 个文件后暂停
            if (processedFiles % 5 === 0) {
                await this.sleep(500);
            }
        }

        if (result.uploadedFiles === totalFiles - result.skippedFiles) {
            new Notice(t('syncCompleted', { count: result.uploadedFiles }));
            console.log('Full sync completed:', result);
            // 更新状态栏 - 同步完成
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(true);
            }
        } else {
            new Notice(t('syncWithErrors', { uploaded: result.uploadedFiles, errors: result.errorFiles }));
            console.log('Sync completed with errors:', result);
            // 更新状态栏 - 同步有错误
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
        }

        return result;
    }

    // 获取 Vault 中所有文件
    getAllFiles(): TFile[] {
        const files: TFile[] = [];
        const root = this.vault.getRoot();

        this.collectFiles(root, files);

        return files;
    }

    // 递归收集文件
    private collectFiles(folder: TFolder, files: TFile[]) {
        for (const child of folder.children) {
            if (child instanceof TFile) {
                files.push(child);
            } else if (child instanceof TFolder) {
                this.collectFiles(child, files);
            }
        }
    }

    // ArrayBuffer 转 Base64
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // 辅助函数：sleep
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 检查文件是否应该排除
    shouldExcludeFile(path: string): boolean {
        const { excludedPaths, excludedExtensions } = this.plugin.settings;

        for (const excludedPath of excludedPaths) {
            if (path.startsWith(excludedPath)) {
                return true;
            }
        }

        const ext = path.split('.').pop() || '';
        if (excludedExtensions.includes(ext)) {
            return true;
        }

        return false;
    }

    // 检查文件大小是否超限
    isFileSizeOk(size: number): boolean {
        const limitBytes = this.plugin.settings.fileSizeLimit * 1024 * 1024;
        return size <= limitBytes;
    }

    // 从远程拉取单个文件
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
            // 获取远程文件（传入 blobSha 以支持大文件回退到 Git Blob API）
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
            const content = this.base64ToArrayBuffer(remoteFile.content);

            // 获取本地文件
            const localFile = this.vault.getAbstractFileByPath(path);

            if (localFile instanceof TFile) {
                // 本地文件存在
                if (!forceOverwrite) {
                    // 非强制模式，检查是否需要更新
                    const localModified = new Date(localFile.stat.mtime);
                    const fileState = this.plugin.stateManager.getFileState(path);

                    // 如果本地修改时间晚于同步记录，可能存在冲突
                    if (fileState && localModified > new Date(fileState.localModified)) {
                        // 本地有修改，标记为冲突
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

                // 更新本地文件（设置标志防止 vault 事件触发重复上传）
                this.isDownloading = true;
                try {
                    await this.vault.modifyBinary(localFile, content);
                } finally {
                    this.isDownloading = false;
                }
            } else {
                // 本地文件不存在，创建新文件
                this.isDownloading = true;
                try {
                    // 确保父目录存在
                    const parentPath = path.substring(0, path.lastIndexOf('/'));
                    if (parentPath) {
                        await this.ensureFolderExists(parentPath);
                    }
                    await this.vault.createBinary(path, content);
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

    // 确保目录存在（递归创建）
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const folder = this.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) {
            return; // 目录已存在
        }

        // 递归创建父目录
        const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
        if (parentPath) {
            await this.ensureFolderExists(parentPath);
        }

        // 创建当前目录
        await this.vault.createFolder(folderPath);
    }

    // 从远程全量拉取
    async pullFromRemote(): Promise<SyncResult> {
        if (!this.client) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: ['Not authenticated']
            };
        }

        const { repoOwner, repoName, excludedPaths, excludedExtensions } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: [t('repoNotConfigured')]
            };
        }

        // 开始同步
        if (this.plugin.statusBar) {
            this.plugin.statusBar.startSyncing();
        }

        new Notice(t('startingSync') + '...');
        console.log('Starting pull from remote...');

        const result: SyncResult = {
            success: true,
            uploadedFiles: 0,
            skippedFiles: 0,
            errorFiles: 0,
            deletedFiles: 0,
            errors: []
        };

        try {
            // 获取远程所有文件
            const remoteFiles = await this.client.getAllFiles(repoOwner, repoName);
            const remoteFilePaths = new Set(remoteFiles.map(f => f.path));
            const totalFiles = remoteFiles.length;
            let processedFiles = 0;

            for (const remoteFile of remoteFiles) {
                processedFiles++;

                // 更新状态栏进度（每个文件都更新）
                if (this.plugin.statusBar) {
                    this.plugin.statusBar.updateProgress(processedFiles, totalFiles, 'pull');
                }

                // 跳过 .git 目录和排除路径
                if (remoteFile.path.startsWith('.git/') ||
                    remoteFile.path === '.gitignore' ||
                    remoteFile.path === 'README.md' ||
                    remoteFile.path === 'LICENSE') {
                    result.skippedFiles++;
                    continue;
                }

                // 检查排除规则
                if (this.shouldExcludeFile(remoteFile.path)) {
                    result.skippedFiles++;
                    continue;
                }

                // 下载文件（强制覆盖本地，因为是"以远程为准"；传入 SHA 避免编码问题）
                const success = await this.downloadFile(remoteFile.path, true, remoteFile.sha);
                if (success) {
                    result.uploadedFiles++;
                } else {
                    result.errorFiles++;
                    result.errors.push(`Failed to download: ${remoteFile.path}`);
                }

                // 避免触发 API 限流
                if (processedFiles % 5 === 0) {
                    await this.sleep(500);
                }
            }

            // 检查本地是否有远程不存在的文件（远程已删除）
            const localFiles = this.getAllFiles();
            
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
                        await this.vault.delete(localFile);
                        result.deletedFiles++;
                        console.log('Deleted local file (remote deleted):', localFile.path);
                    } catch (error) {
                        result.errorFiles++;
                        result.errors.push(`Failed to delete local: ${localFile.path}`);
                    }
                }
            }

            // 更新状态栏
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(result.errorFiles === 0);
            }

            const message = result.deletedFiles > 0
                ? t('pullWithDeletes', { downloaded: result.uploadedFiles, deleted: result.deletedFiles })
                : t('pullCompleted', { count: result.uploadedFiles });
            new Notice(message);
            console.log('Pull completed:', result);

            return result;
        } catch (error) {
            console.error('Pull failed:', error);
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: [String(error)]
            };
        }
    }

    // 双向同步（先拉取远程变更，再推送本地变更）
    async bidirectionalSync(): Promise<SyncResult> {
        if (!this.client) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: ['Not authenticated']
            };
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: [t('repoNotConfigured')]
            };
        }

        // 开始同步
        if (this.plugin.statusBar) {
            this.plugin.statusBar.startSyncing();
        }

        new Notice(t('startingSync'));
        console.log('Starting bidirectional sync...');

        const result: SyncResult = {
            success: true,
            uploadedFiles: 0,
            skippedFiles: 0,
            errorFiles: 0,
            deletedFiles: 0,
            errors: []
        };

        try {
            // 第一步：获取远程所有文件
            const remoteFiles = await this.client.getAllFiles(repoOwner, repoName);
            const remoteFileMap = new Map<string, { sha: string; path: string }>();
            for (const file of remoteFiles) {
                remoteFileMap.set(file.path, { sha: file.sha, path: file.path });
            }

            // 第二步：拉取远程变更（检测冲突，不强制覆盖）
                        const totalRemoteFiles = remoteFiles.length;
            let processedRemoteFiles = 0;

            for (const remoteFile of remoteFiles) {
                processedRemoteFiles++;

                // 更新进度（拉取阶段）
                if (this.plugin.statusBar) {
                    this.plugin.statusBar.updateProgress(processedRemoteFiles, totalRemoteFiles, 'pull');
                }

                // 跳过 .git 目录和排除路径
                if (remoteFile.path.startsWith('.git/') ||
                    remoteFile.path === '.gitignore' ||
                    remoteFile.path === 'README.md' ||
                    remoteFile.path === 'LICENSE') {
                    result.skippedFiles++;
                    continue;
                }

                // 检查排除规则
                if (this.shouldExcludeFile(remoteFile.path)) {
                    result.skippedFiles++;
                    continue;
                }

                // 下载文件（不强制覆盖，检测冲突；传入 sha 以支持大文件）
                const success = await this.downloadFile(remoteFile.path, false, remoteFile.sha);
                if (success) {
                    result.uploadedFiles++;
                }
                // 冲突时不计入错误，由后续流程处理
            }

            // 第三步：检查是否有冲突
            const conflicts = this.plugin.stateManager.getConflictFiles();
            if (conflicts.length > 0) {
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

            // 第四步：检查本地是否有远程不存在的文件（远程已删除）
            const localFiles = this.getAllFiles();

            // 设置标志，防止 vault.on('delete') 事件触发 deleteRemoteFile 连锁操作
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

                    // 如果本地存在但远程不存在
                    if (!remoteFileMap.has(localFile.path)) {
                        // 只删除曾经同步过的文件（远程确实删了它）
                        // 从未同步过的文件（本地新建未上传）不能删除
                        const fileState = this.plugin.stateManager.getFileState(localFile.path);
                        if (fileState && fileState.status === 'synced') {
                            try {
                                await this.vault.delete(localFile);
                                result.deletedFiles++;
                                console.log('Deleted local file (remote deleted):', localFile.path);
                            } catch (error) {
                                result.errorFiles++;
                                result.errors.push(`Failed to delete local: ${localFile.path}`);
                            }
                        }
                    }
                }
            } finally {
                this.isDeletingLocalFiles = false;
            }

            // 第五步：推送本地变更（使用已有的 SHA 映射减少 API 调用）
            // 重新获取本地文件列表，避免使用第四步删除操作后的过期快照（防止 ENOENT）
            const currentLocalFiles = this.getAllFiles();
            let uploadCount = 0;
            let uploadErrorCount = 0;
            const totalLocalFiles = currentLocalFiles.length;
            let processedLocalFiles = 0;

            for (const localFile of currentLocalFiles) {
                processedLocalFiles++;

                // 更新进度（上传阶段）
                if (this.plugin.statusBar) {
                    this.plugin.statusBar.updateProgress(processedLocalFiles, totalLocalFiles, 'push');
                }

                // 跳过排除规则
                if (this.shouldExcludeFile(localFile.path)) {
                    continue;
                }

                // 跳过临时文件名
                if (isTempFileName(localFile.basename)) {
                    continue;
                }

                // 跳过大文件
                if (!this.isFileSizeOk(localFile.stat.size)) {
                    continue;
                }

                // 获取远程 SHA
                const remoteInfo = remoteFileMap.get(localFile.path);
                const fileState = this.plugin.stateManager.getFileState(localFile.path);

                // 判断是否需要上传：
                // 1. 远程不存在该文件
                // 2. 本地有修改（修改时间晚于上次同步记录）
                const needsUpload = !remoteInfo ||
                    !fileState ||
                    new Date(localFile.stat.mtime) > new Date(fileState.localModified);

                if (needsUpload) {
                    const success = await this.uploadSingleFile(localFile, remoteInfo?.sha);
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

            // 更新状态栏
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(result.errorFiles === 0);
            }

            const message = result.deletedFiles > 0
                ? t('pullWithDeletes', { downloaded: result.uploadedFiles - uploadCount, deleted: result.deletedFiles })
                : t('syncCompleted', { count: result.uploadedFiles });
            new Notice(message);
            console.log('Bidirectional sync completed:', result);

            return result;
        } catch (error) {
            console.error('Bidirectional sync failed:', error);
            if (this.plugin.statusBar) {
                this.plugin.statusBar.endSync(false);
            }
            return {
                success: false,
                uploadedFiles: 0,
                skippedFiles: 0,
                errorFiles: 0,
                deletedFiles: 0,
                errors: [String(error)]
            };
        }
    }

    // 上传单个文件
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
            console.log('Skipping temp file:', file.path);
            return false;
        }

        // 检查文件大小
        if (!this.isFileSizeOk(file.stat.size)) {
            console.log('File too large, skipping:', file.path);
            return false;
        }

        try {
            const content = await this.vault.readBinary(file);
            const base64Content = this.arrayBufferToBase64(content);

            // 使用已知的 SHA（如果有），否则通过 Tree API 获取
            const sha = knownRemoteSha ?? await this.client.getFileSha(repoOwner, repoName, file.path);

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
            console.error('Failed to upload file:', file.path, error);
            return false;
        }
    }

    // 删除远程文件
    async deleteRemoteFile(path: string): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) {
            return false;
        }

        try {
            // 通过 Tree API 获取远程文件的 SHA（避免 Contents API 编码问题）
            const remoteSha = await this.client.getFileSha(repoOwner, repoName, path);

            if (!remoteSha) {
                // 远程文件不存在，无需删除（静默返回成功）
                return true;
            }

            // 删除远程文件
            const success = await this.client.deleteFile({
                owner: repoOwner,
                repo: repoName,
                path: path,
                message: `Delete ${path}`,
                sha: remoteSha
            });

            if (success) {
                console.log('Remote file deleted:', path);
            }

            return success;
        } catch (error) {
            console.error('Failed to delete remote file:', path, error);
            return false;
        }
    }

    // Base64 转 ArrayBuffer
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
