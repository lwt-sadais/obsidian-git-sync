/**
 * 同步工具函数
 */

import { TFile, TFolder, Vault } from 'obsidian';
import { TEMP_FILE_NAMES } from '../constants';

// ============================================
// 类型定义
// ============================================

/**
 * 同步结果
 */
export interface SyncResult {
    success: boolean;
    uploadedFiles: number;
    skippedFiles: number;
    errorFiles: number;
    deletedFiles: number;
    errors: string[];
}

// ============================================
// SyncResult 工厂函数
// ============================================

/**
 * 创建成功的同步结果
 */
export function createSyncResult(): SyncResult {
    return {
        success: true,
        uploadedFiles: 0,
        skippedFiles: 0,
        errorFiles: 0,
        deletedFiles: 0,
        errors: []
    };
}

/**
 * 创建错误同步结果
 */
export function createErrorResult(message: string): SyncResult {
    return {
        ...createSyncResult(),
        success: false,
        errors: [message]
    };
}

// ============================================
// 文件过滤工具
// ============================================

/**
 * 检查是否为临时文件名
 */
export function isTempFileName(fileName: string): boolean {
    return TEMP_FILE_NAMES.some(tempName =>
        fileName === tempName || fileName.startsWith(tempName + '-')
    );
}

/**
 * 获取 Vault 中所有文件
 */
export function getAllVaultFiles(vault: Vault): TFile[] {
    const files: TFile[] = [];
    const root = vault.getRoot();
    collectFiles(root, files);
    return files;
}

/**
 * 递归收集文件
 */
function collectFiles(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
        if (child instanceof TFile) {
            files.push(child);
        } else if (child instanceof TFolder) {
            collectFiles(child, files);
        }
    }
}

// ============================================
// 辅助函数
// ============================================

/**
 * sleep 函数
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从路径中提取文件名（不含扩展名）
 */
export function getFileNameFromPath(path: string): string {
    const fileName = path.split('/').pop() || '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}