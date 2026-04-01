/**
 * 操作管理器 - 统一管理所有同步操作的状态
 */

import { t } from '../i18n';

/**
 * 操作类型
 */
export type OperationType =
    | 'idle'              // 无操作
    | 'bidirectional'     // 双向同步
    | 'pull'              // 以远程为准
    | 'push'              // 以本地为准
    | 'upload_batch'      // 批量上传（文件监听触发）
    | 'delete_batch'      // 批量删除（文件监听触发）
    | 'download_single';  // 单文件下载（内部使用）

/**
 * 操作状态
 */
export interface OperationState {
    type: OperationType;
    startTime: number;
    progress?: {
        current: number;
        total: number;
        phase?: 'pull' | 'push';
    };
}

/**
 * 操作信息（用于显示）
 */
export interface OperationInfo {
    type: OperationType;
    displayName: string;
    isBlocking: boolean;  // 是否阻塞用户操作
    progress?: {
        current: number;
        total: number;
        phase?: 'pull' | 'push';
    };
}

/**
 * 操作管理器
 *
 * 统一管理所有同步操作的状态，提供：
 * 1. 当前操作类型查询
 * 2. 是否忙碌判断
 * 3. 进度更新
 * 4. 操作启动/结束生命周期
 */
export class OperationManager {
    private currentOperation: OperationState = { type: 'idle', startTime: 0 };

    /**
     * 获取当前操作类型
     */
    getCurrentType(): OperationType {
        return this.currentOperation.type;
    }

    /**
     * 获取当前操作信息（用于显示）
     */
    getCurrentOperation(): OperationInfo {
        const type = this.currentOperation.type;

        if (type === 'idle') {
            return {
                type: 'idle',
                displayName: '',
                isBlocking: false
            };
        }

        return {
            type,
            displayName: this.getDisplayName(type),
            isBlocking: this.isBlockingOperation(type),
            progress: this.currentOperation.progress
        };
    }

    /**
     * 检查是否有操作正在进行
     */
    isBusy(): boolean {
        return this.currentOperation.type !== 'idle';
    }

    /**
     * 检查是否是阻塞型操作（禁止用户触发其他操作）
     */
    isBlocking(): boolean {
        return this.isBlockingOperation(this.currentOperation.type);
    }

    /**
     * 判断操作类型是否阻塞用户操作
     *
     * 阻塞型操作：bidirectional, pull, push
     * 非阻塞型操作：upload_batch, delete_batch, download_single（内部使用）
     */
    private isBlockingOperation(type: OperationType): boolean {
        return type === 'bidirectional' ||
               type === 'pull' ||
               type === 'push';
    }

    /**
     * 获取操作的显示名称
     */
    private getDisplayName(type: OperationType): string {
        switch (type) {
            case 'bidirectional':
                return t('menuSyncNow');
            case 'pull':
                return t('menuPullFromRemote');
            case 'push':
                return t('menuPushToRemote');
            case 'upload_batch':
                return t('statusSyncing');
            case 'delete_batch':
                return t('statusSyncing');
            case 'download_single':
                return t('statusSyncing');
            default:
                return '';
        }
    }

    /**
     * 启动操作
     */
    start(type: OperationType): void {
        this.currentOperation = {
            type,
            startTime: Date.now()
        };
    }

    /**
     * 更新进度
     */
    updateProgress(current: number, total: number, phase?: 'pull' | 'push'): void {
        if (this.currentOperation.type === 'idle') {
            return;
        }

        this.currentOperation.progress = {
            current,
            total,
            phase
        };
    }

    /**
     * 结束操作
     */
    end(): void {
        this.currentOperation = { type: 'idle', startTime: 0 };
    }

    /**
     * 检查是否可以启动新操作
     *
     * @param type 要启动的操作类型
     * @returns 是否可以启动
     */
    canStart(type: OperationType): boolean {
        // 当前空闲，可以启动任何操作
        if (this.currentOperation.type === 'idle') {
            return true;
        }

        // 内部操作（download_single）不阻塞其他内部操作
        if (type === 'download_single' && !this.isBlocking()) {
            return true;
        }

        // 其他情况：正在阻塞操作中，不能启动新操作
        return false;
    }
}