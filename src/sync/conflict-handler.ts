import { TFile, Vault, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { BINARY_EXTENSIONS } from '../constants';
import { t } from '../i18n';
import { logger } from '../utils/logger';

// 冲突解决策略
export type ConflictResolution = 'keep-local' | 'use-remote' | 'keep-both' | 'smart-merge';

// 冲突文件信息
export interface ConflictFile {
    path: string;
    localContent: string;
    remoteContent: string;
    remoteSha: string;
    localModified: string;
    isBinary: boolean;
}

// 合并结果
export interface MergeResult {
    success: boolean;
    content: string;
    hasConflictBlocks: boolean;
}

export class ConflictHandler {
    plugin: GitSyncPlugin;
    vault: Vault;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
        this.vault = plugin.app.vault;
    }

    /**
     * 判断是否为二进制文件
     */
    isBinaryFile(path: string): boolean {
        const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
        return BINARY_EXTENSIONS.includes(ext as any);
    }

    // 生成冲突副本文件名
    generateConflictFilename(path: string): string {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '');

        const dotIndex = path.lastIndexOf('.');
        if (dotIndex > 0) {
            const name = path.substring(0, dotIndex);
            const ext = path.substring(dotIndex);
            return `${name}_conflict_${timestamp}${ext}`;
        }
        return `${path}_conflict_${timestamp}`;
    }

    // 获取文件内容
    async getFileContent(file: TFile): Promise<string> {
        try {
            return await this.vault.read(file);
        } catch (error) {
            logger.error('Failed to read file:', file.path, error);
            return '';
        }
    }

    // 智能合并 Markdown 文件
    smartMerge(localContent: string, remoteContent: string): MergeResult {
        // 按段落分割
        const localParagraphs = this.splitParagraphs(localContent);
        const remoteParagraphs = this.splitParagraphs(remoteContent);

        // 使用 LCS 算法找到公共段落
        const lcs = this.findLCS(localParagraphs, remoteParagraphs);

        // 合并段落
        const mergedParagraphs: string[] = [];
        let localIdx = 0;
        let remoteIdx = 0;
        let lcsIdx = 0;
        let hasConflictBlocks = false;

        while (localIdx < localParagraphs.length || remoteIdx < remoteParagraphs.length) {
            const localPara = localParagraphs[localIdx];
            const remotePara = remoteParagraphs[remoteIdx];
            const lcsPara = lcs[lcsIdx];

            // 如果两边都有 LCS 段落，直接添加
            if (lcsPara && localPara === lcsPara && remotePara === lcsPara) {
                mergedParagraphs.push(lcsPara);
                localIdx++;
                remoteIdx++;
                lcsIdx++;
            }
            // 本地有新增段落
            else if (localPara !== undefined && (!lcsPara || localPara !== lcsPara)) {
                // 检查远程是否也有不同的段落（冲突）
                if (remotePara !== undefined && (!lcsPara || remotePara !== lcsPara)) {
                    // 双方都有修改，标记冲突
                    hasConflictBlocks = true;
                    mergedParagraphs.push('<<<<<<< LOCAL');
                    mergedParagraphs.push(localPara);
                    mergedParagraphs.push('=======');
                    mergedParagraphs.push(remotePara);
                    mergedParagraphs.push('>>>>>>> REMOTE');
                    localIdx++;
                    remoteIdx++;
                } else {
                    // 只有本地有修改，直接添加
                    mergedParagraphs.push(localPara);
                    localIdx++;
                }
            }
            // 远程有新增段落
            else if (remotePara !== undefined && (!lcsPara || remotePara !== lcsPara)) {
                mergedParagraphs.push(remotePara);
                remoteIdx++;
            }
            // 都到达末尾
            else {
                break;
            }
        }

        return {
            success: true,
            content: mergedParagraphs.join('\n\n'),
            hasConflictBlocks
        };
    }

    // 按段落分割（保留空行分隔）
    splitParagraphs(content: string): string[] {
        // 按连续空行分割段落
        return content.split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    // LCS 算法（最长公共子序列）
    findLCS(a: string[], b: string[]): string[] {
        const m = a.length;
        const n = b.length;
        const dp: number[][] = [];

        // 初始化 DP 表
        for (let i = 0; i <= m; i++) {
            dp[i] = [];
            for (let j = 0; j <= n; j++) {
                dp[i][j] = 0;
            }
        }

        // 填充 DP 表
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // 回溯找到 LCS
        const result: string[] = [];
        let i = m;
        let j = n;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                result.unshift(a[i - 1]);
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }

        return result;
    }

    // 解决冲突
    async resolveConflict(
        conflict: ConflictFile,
        resolution: ConflictResolution
    ): Promise<boolean> {
        const { path, localContent, remoteContent, remoteSha, isBinary } = conflict;

        try {
            switch (resolution) {
                case 'keep-local':
                    // 保持本地版本，不上传
                    // 清除冲突状态，标记为已同步
                    await this.plugin.stateManager.updateFileSynced(
                        path,
                        remoteSha,
                        new Date().toISOString()
                    );
                    new Notice(t('conflictResolvedKeepLocal', { path }));
                    break;

                case 'use-remote':
                    // 使用远程版本覆盖本地
                    const localFile = this.vault.getAbstractFileByPath(path);
                    if (localFile instanceof TFile) {
                        await this.vault.modify(localFile, remoteContent);
                    }
                    await this.plugin.stateManager.updateFileSynced(
                        path,
                        remoteSha,
                        new Date().toISOString()
                    );
                    new Notice(t('conflictResolvedUseRemote', { path }));
                    break;

                case 'keep-both':
                    // 创建冲突副本保留远程版本
                    const conflictPath = this.generateConflictFilename(path);
                    const originalFile = this.vault.getAbstractFileByPath(path);

                    if (originalFile instanceof TFile) {
                        // 创建冲突副本（保留远程内容）
                        await this.vault.create(conflictPath, remoteContent);

                        // 本地保持不变
                        await this.plugin.stateManager.updateFileSynced(
                            path,
                            remoteSha,
                            new Date().toISOString()
                        );

                        // 新副本标记为待同步
                        await this.plugin.stateManager.markFilePending(
                            conflictPath,
                            new Date().toISOString()
                        );
                    }
                    new Notice(t('conflictResolvedKeepBoth', { path, conflictPath }));
                    break;

                case 'smart-merge':
                    if (isBinary) {
                        // 二进制文件无法合并，使用较新版本
                        new Notice(t('conflictBinaryNoMerge', { path }));
                        return false;
                    }

                    // 智能合并
                    const mergeResult = this.smartMerge(localContent, remoteContent);

                    if (mergeResult.hasConflictBlocks) {
                        // 合后有冲突块，写入合并结果让用户手动编辑
                        const file = this.vault.getAbstractFileByPath(path);
                        if (file instanceof TFile) {
                            await this.vault.modify(file, mergeResult.content);
                        }
                        new Notice(t('conflictMergedWithBlocks', { path }));
                        // 不清除冲突状态，等用户手动解决
                    } else {
                        // 完美合并，写入并更新状态
                        const file = this.vault.getAbstractFileByPath(path);
                        if (file instanceof TFile) {
                            await this.vault.modify(file, mergeResult.content);
                        }
                        await this.plugin.stateManager.updateFileSynced(
                            path,
                            remoteSha,
                            new Date().toISOString()
                        );
                        new Notice(t('conflictMerged', { path }));
                    }
                    break;
            }

            return true;
        } catch (error) {
            logger.error('Failed to resolve conflict:', path, error);
            new Notice(t('conflictResolveFailed', { path }));
            return false;
        }
    }

    // 批量解决冲突
    async resolveConflicts(
        conflicts: ConflictFile[],
        resolutions: Map<string, ConflictResolution>
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const conflict of conflicts) {
            const resolution = resolutions.get(conflict.path);
            if (resolution) {
                const result = await this.resolveConflict(conflict, resolution);
                if (result) {
                    success++;
                } else {
                    failed++;
                }
            }
        }

        return { success, failed };
    }
}