import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { t } from '../i18n';
import { logger } from '../utils/logger';

/**
 * 未同步文件处理选项
 */
export type UnsyncedFileAction = 'keep-upload' | 'delete' | 'skip';

/**
 * 未同步文件确认模态框
 */
export class UnsyncedFilesModal extends Modal {
    plugin: GitSyncPlugin;
    unsyncedFiles: TFile[];
    onResolve: (action: UnsyncedFileAction) => void;

    /**
     * 每个文件的选择
     * true = 保留并上传, false = 删除
     */
    fileChoices: Map<string, boolean> = new Map();

    constructor(
        app: App,
        plugin: GitSyncPlugin,
        unsyncedFiles: TFile[],
        onResolve: (action: UnsyncedFileAction) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.unsyncedFiles = unsyncedFiles;
        this.onResolve = onResolve;

        // 默认全部保留
        for (const file of unsyncedFiles) {
            this.fileChoices.set(file.path, true);
        }
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.addClass('git-sync-unsynced-modal');

        // 标题
        contentEl.createEl('h2', { text: t('unsyncedFilesTitle') });
        contentEl.createEl('p', {
            text: t('unsyncedFilesDesc', { count: this.unsyncedFiles.length }),
            cls: 'git-sync-unsynced-desc'
        });

        // 文件列表
        const listEl = contentEl.createDiv({ cls: 'git-sync-unsynced-list' });

        for (const file of this.unsyncedFiles) {
            this.renderFileItem(listEl, file);
        }

        // 操作按钮
        const buttonContainer = contentEl.createDiv({ cls: 'git-sync-unsynced-buttons' });

        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText(t('unsyncedKeepAll'))
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onResolve('keep-upload');
                }))
            .addButton(button => button
                .setButtonText(t('unsyncedDeleteAll'))
                .setWarning()
                .onClick(() => {
                    this.close();
                    this.onResolve('delete');
                }))
            .addButton(button => button
                .setButtonText(t('cancel'))
                .onClick(() => {
                    this.close();
                    this.onResolve('skip');
                }));
    }

    renderFileItem(container: HTMLElement, file: TFile) {
        const itemEl = container.createDiv({ cls: 'git-sync-unsynced-item' });

        // 文件路径
        const pathEl = itemEl.createDiv({ cls: 'git-sync-unsynced-path' });
        pathEl.createEl('span', { text: '📄', cls: 'git-sync-unsynced-icon' });
        pathEl.createEl('span', { text: file.path });

        // 文件大小
        const sizeKB = Math.round(file.stat.size / 1024);
        itemEl.createDiv({
            text: `${sizeKB} KB`,
            cls: 'git-sync-unsynced-size'
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 显示未同步文件确认模态框
 * @returns 用户选择的操作
 */
export function showUnsyncedFilesModal(
    plugin: GitSyncPlugin,
    unsyncedFiles: TFile[]
): Promise<UnsyncedFileAction> {
    return new Promise((resolve) => {
        const modal = new UnsyncedFilesModal(
            plugin.app,
            plugin,
            unsyncedFiles,
            (action) => resolve(action)
        );
        modal.open();
    });
}