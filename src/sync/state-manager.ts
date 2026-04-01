import { App } from 'obsidian';
import GitSyncPlugin from '../main';
import { logger } from '../utils/logger';

// 同步状态存储
export interface SyncStateData {
    lastSyncTime: string;
    lastCommitSha: string;
    fileStates: Record<string, FileSyncStateData>;
}

// 文件同步状态
export interface FileSyncStateData {
    localPath: string;
    remoteSha: string;
    localModified: string;
    status: 'synced' | 'pending' | 'conflict';
}

// 状态管理器
export class StateManager {
    plugin: GitSyncPlugin;
    state: SyncStateData;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
        this.state = {
            lastSyncTime: '',
            lastCommitSha: '',
            fileStates: {}
        };
    }

    // 加载状态
    async loadState(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            if (data && data.syncState) {
                this.state = data.syncState;
            }
        } catch (error) {
            logger.error('Failed to load sync state:', error);
        }
    }

    // 保存状态
    async saveState(): Promise<void> {
        try {
            const data = await this.plugin.loadData() || {};
            data.syncState = this.state;
            await this.plugin.saveData(data);
        } catch (error) {
            logger.error('Failed to save sync state:', error);
        }
    }

    // 获取文件状态
    getFileState(path: string): FileSyncStateData | null {
        return this.state.fileStates[path] || null;
    }

    // 设置文件状态
    async setFileState(path: string, state: FileSyncStateData): Promise<void> {
        this.state.fileStates[path] = state;
        await this.saveState();
    }

    // 更新文件同步状态
    async updateFileSynced(path: string, remoteSha: string, localModified: string): Promise<void> {
        this.state.fileStates[path] = {
            localPath: path,
            remoteSha: remoteSha,
            localModified: localModified,
            status: 'synced'
        };
        this.state.lastSyncTime = new Date().toISOString();
        await this.saveState();
    }

    // 设置文件状态（通用方法）
    private async setFileStatus(path: string, status: 'synced' | 'pending' | 'conflict', localModified: string): Promise<void> {
        const existing = this.state.fileStates[path];
        this.state.fileStates[path] = {
            localPath: path,
            remoteSha: existing?.remoteSha || '',
            localModified: localModified,
            status: status
        };
        await this.saveState();
    }

    // 标记文件待同步
    async markFilePending(path: string, localModified: string): Promise<void> {
        await this.setFileStatus(path, 'pending', localModified);
    }

    // 标记文件冲突
    async markFileConflict(path: string, localModified: string): Promise<void> {
        await this.setFileStatus(path, 'conflict', localModified);
    }

    // 获取所有待同步文件
    getPendingFiles(): string[] {
        return Object.keys(this.state.fileStates).filter(
            path => this.state.fileStates[path].status === 'pending'
        );
    }

    // 获取所有冲突文件
    getConflictFiles(): string[] {
        return Object.keys(this.state.fileStates).filter(
            path => this.state.fileStates[path].status === 'conflict'
        );
    }

    // 清除文件状态
    async clearFileState(path: string): Promise<void> {
        delete this.state.fileStates[path];
        await this.saveState();
    }

    // 清除所有状态
    async clearAllState(): Promise<void> {
        this.state = {
            lastSyncTime: '',
            lastCommitSha: '',
            fileStates: {}
        };
        await this.saveState();
    }

    // 获取最后同步时间
    getLastSyncTime(): string {
        return this.state.lastSyncTime;
    }

    // 设置最后同步时间
    async setLastSyncTime(time: string): Promise<void> {
        this.state.lastSyncTime = time;
        await this.saveState();
    }

    // 获取最后 commit SHA
    getLastCommitSha(): string {
        return this.state.lastCommitSha;
    }

    // 设置最后 commit SHA
    async setLastCommitSha(sha: string): Promise<void> {
        this.state.lastCommitSha = sha;
        await this.saveState();
    }

    // 检查文件是否需要同步
    needsSync(path: string, localModified: string): boolean {
        const state = this.getFileState(path);
        if (!state) return true;

        // 如果本地修改时间晚于记录时间，需要同步
        return new Date(localModified) > new Date(state.localModified);
    }

    // 检查文件是否有远程变更
    hasRemoteChanges(path: string, remoteSha: string): boolean {
        const state = this.getFileState(path);
        if (!state) return true;

        return state.remoteSha !== remoteSha;
    }
}
