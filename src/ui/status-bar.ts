import { Menu, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { t } from '../i18n';
import { ConflictResolutionModal } from './conflict-modal';

// 同步状态类型
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'conflict' | 'offline';

// 状态栏管理器
export class StatusBarManager {
    plugin: GitSyncPlugin;
    statusBarItem: HTMLElement;
    currentStatus: SyncStatus = 'offline';
    statusText: string = '';
    pendingCount: number = 0;
    conflictCount: number = 0;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
        this.statusBarItem = plugin.addStatusBarItem();
        this.render();
    }

    // 设置状态
    setStatus(status: SyncStatus, text?: string): void {
        this.currentStatus = status;
        this.statusText = text || '';
        this.render();
    }

    // 设置待同步数量
    setPendingCount(count: number): void {
        this.pendingCount = count;
        if (count > 0 && this.currentStatus === 'synced') {
            this.setStatus('pending');
        }
        this.render();
    }

    // 设置冲突数量
    setConflictCount(count: number): void {
        this.conflictCount = count;
        if (count > 0) {
            this.setStatus('conflict');
        }
        this.render();
    }

    // 渲染状态栏
    render(): void {
        this.statusBarItem.empty();
        this.statusBarItem.addClass('git-sync-status-bar');

        // 状态图标
        const iconEl = this.statusBarItem.createSpan({ cls: 'git-sync-icon' });
        iconEl.setText(this.getStatusIcon());

        // 状态文本
        const textEl = this.statusBarItem.createSpan({ cls: 'git-sync-text' });
        textEl.setText(this.getStatusText());

        // 添加状态类
        this.statusBarItem.removeClass('synced', 'syncing', 'pending', 'error', 'conflict', 'offline');
        this.statusBarItem.addClass(this.currentStatus);

        // 点击菜单
        this.statusBarItem.onClickEvent((evt) => {
            this.showMenu(evt);
        });
    }

    // 获取状态图标
    getStatusIcon(): string {
        switch (this.currentStatus) {
            case 'synced':
                return '✓';
            case 'syncing':
                return '⟳';
            case 'pending':
                return '⏳';
            case 'error':
                return '✗';
            case 'conflict':
                return '⚡';
            case 'offline':
                return '○';
            default:
                return '○';
        }
    }

    // 获取状态文本
    getStatusText(): string {
        if (this.statusText) {
            return this.statusText;
        }

        switch (this.currentStatus) {
            case 'synced':
                return t('statusSynced');
            case 'syncing':
                return t('statusSyncing');
            case 'pending':
                if (this.pendingCount > 0) {
                    return `${this.pendingCount} ${t('statusPending').toLowerCase()}`;
                }
                return t('statusPending');
            case 'error':
                return t('statusError');
            case 'conflict':
                if (this.conflictCount > 0) {
                    return t('menuConflicts', { count: this.conflictCount });
                }
                return t('statusConflict');
            case 'offline':
                return t('statusOffline');
            default:
                return 'Git Sync';
        }
    }

    // 显示点击菜单
    showMenu(evt: MouseEvent): void {
        const menu = new Menu();

        // 检查是否有操作正在进行
        const currentOp = this.plugin.operationManager.getCurrentOperation();
        const isBusy = currentOp.type !== 'idle';

        if (isBusy) {
            // 显示当前操作状态，禁用所有操作项
            menu.addItem((item) => {
                item.setTitle(t('menuBusy', { action: currentOp.displayName }))
                    .setDisabled(true);
            });
        } else {
            // 日常同步（双向）
            menu.addItem((item) => {
                item.setTitle(t('menuSyncNow'))
                    .onClick(() => this.plugin.syncNow());
            });

            menu.addSeparator();

            // 以远程为准
            menu.addItem((item) => {
                item.setTitle(t('menuPullFromRemote'))
                    .onClick(() => this.plugin.pullFromRemote());
            });

            // 以本地为准
            menu.addItem((item) => {
                item.setTitle(t('menuPushToRemote'))
                    .onClick(() => this.plugin.fullSync());
            });
        }

        // 如果有冲突，显示冲突解决选项（即使忙碌也可以解决冲突）
        if (this.conflictCount > 0) {
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle(t('menuConflicts', { count: this.conflictCount }))
                    .onClick(() => {
                        const modal = new ConflictResolutionModal(this.plugin.app, this.plugin);
                        modal.open();
                    });
            });
        }

        // 状态信息
        menu.addSeparator();
        const lastSync = this.plugin.stateManager.getLastSyncTime();
        if (lastSync) {
            const timeStr = this.formatTime(lastSync);
            menu.addItem((item) => {
                item.setTitle(t('menuLastSync', { time: timeStr }))
                    .setDisabled(true);
            });
        } else {
            menu.addItem((item) => {
                item.setTitle(t('menuNeverSynced'))
                    .setDisabled(true);
            });
        }

        menu.showAtMouseEvent(evt);
    }

    // 格式化时间
    formatTime(isoString: string): string {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) {
            return t('timeJustNow');
        } else if (minutes < 60) {
            return t('timeMinutesAgo', { count: minutes });
        } else if (hours < 24) {
            return t('timeHoursAgo', { count: hours });
        } else if (days < 7) {
            return t('timeDaysAgo', { count: days });
        } else {
            return date.toLocaleDateString();
        }
    }

    // 开始同步动画
    startSyncing(): void {
        this.setStatus('syncing');
        // 添加旋转动画
        const iconEl = this.statusBarItem.querySelector('.git-sync-icon');
        if (iconEl) {
            iconEl.addClass('git-sync-icon-spin');
        }
    }

    // 结束同步
    endSync(success: boolean): void {
        const iconEl = this.statusBarItem.querySelector('.git-sync-icon');
        if (iconEl) {
            iconEl.removeClass('git-sync-icon-spin');
        }

        if (success) {
            this.setStatus('synced');
            this.setPendingCount(0);
        } else {
            this.setStatus('error');
        }
    }

    // 更新同步进度
    updateProgress(current: number, total: number, phase?: 'pull' | 'push'): void {
        const phaseText = phase === 'pull' ? '↓' : phase === 'push' ? '↑' : '';
        this.setStatus('syncing', `${phaseText}${current}/${total}`);
    }
}