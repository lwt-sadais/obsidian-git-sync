import { App, Modal, Setting, TFile, Notice, MarkdownRenderer, Component } from 'obsidian';
import GitSyncPlugin from '../main';
import { ConflictHandler, ConflictFile, ConflictResolution } from '../sync/conflict-handler';
import { t } from '../i18n';

// 冲突解决面板
export class ConflictResolutionModal extends Modal {
    plugin: GitSyncPlugin;
    conflictHandler: ConflictHandler;
    conflicts: ConflictFile[] = [];
    resolutions: Map<string, ConflictResolution> = new Map();
    selectedResolution: Map<string, string> = new Map();

    constructor(app: App, plugin: GitSyncPlugin) {
        super(app);
        this.plugin = plugin;
        this.conflictHandler = new ConflictHandler(plugin);
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.addClass('git-sync-conflict-modal');

        // 加载冲突文件
        await this.loadConflicts();

        // 标题
        contentEl.createEl('h2', { text: t('conflictResolutionTitle') });
        contentEl.createEl('p', {
            text: t('conflictResolutionDesc', { count: this.conflicts.length }),
            cls: 'git-sync-conflict-desc'
        });

        // 冲突文件列表
        const listEl = contentEl.createDiv({ cls: 'git-sync-conflict-list' });

        for (const conflict of this.conflicts) {
            this.renderConflictItem(listEl, conflict);
        }

        // 操作按钮
        const buttonContainer = contentEl.createDiv({ cls: 'git-sync-conflict-buttons' });

        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText(t('applyResolutions'))
                .setCta()
                .onClick(async () => {
                    await this.applyResolutions();
                }))
            .addButton(button => button
                .setButtonText(t('cancel'))
                .onClick(() => {
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    // 加载冲突文件信息
    async loadConflicts() {
        const conflictPaths = this.plugin.stateManager.getConflictFiles();
        const client = this.plugin.authManager.getClient();

        if (!client) {
            return;
        }

        for (const path of conflictPaths) {
            const localFile = this.app.vault.getAbstractFileByPath(path);
            const fileState = this.plugin.stateManager.getFileState(path);

            if (!(localFile instanceof TFile) || !fileState) {
                continue;
            }

            try {
                // 获取本地内容
                const localContent = await this.app.vault.read(localFile);

                // 获取远程内容
                const remoteFile = await client.getFile({
                    owner: this.plugin.settings.repoOwner,
                    repo: this.plugin.settings.repoName,
                    path: path
                });

                if (!remoteFile || !remoteFile.content) {
                    continue;
                }

                // 解码远程内容
                const remoteContent = this.base64ToString(remoteFile.content);

                const isBinary = this.conflictHandler.isBinaryFile(path);

                this.conflicts.push({
                    path,
                    localContent,
                    remoteContent,
                    remoteSha: remoteFile.sha,
                    localModified: fileState.localModified,
                    isBinary
                });

                // 默认选择智能合并
                this.selectedResolution.set(path, 'smart-merge');
            } catch (error) {
                console.error('Failed to load conflict file:', path, error);
            }
        }
    }

    // Base64 转字符串
    base64ToString(base64: string): string {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    }

    // 渲染单个冲突项
    renderConflictItem(container: HTMLElement, conflict: ConflictFile) {
        const itemEl = container.createDiv({ cls: 'git-sync-conflict-item' });

        // 文件路径
        const headerEl = itemEl.createDiv({ cls: 'git-sync-conflict-item-header' });
        headerEl.createEl('span', { text: '📄', cls: 'git-sync-conflict-icon' });
        headerEl.createEl('span', { text: conflict.path, cls: 'git-sync-conflict-path' });

        if (conflict.isBinary) {
            headerEl.createEl('span', {
                text: t('conflictBinaryFile'),
                cls: 'git-sync-conflict-binary-badge'
            });
        }

        // 解决选项
        const optionsEl = itemEl.createDiv({ cls: 'git-sync-conflict-options' });

        const options: { value: string; label: string; desc: string }[] = [
            { value: 'keep-local', label: t('conflictKeepLocal'), desc: t('conflictKeepLocalDesc') },
            { value: 'use-remote', label: t('conflictUseRemote'), desc: t('conflictUseRemoteDesc') },
            { value: 'keep-both', label: t('conflictKeepBoth'), desc: t('conflictKeepBothDesc') },
            { value: 'smart-merge', label: t('conflictSmartMerge'), desc: t('conflictSmartMergeDesc') }
        ];

        // 二进制文件不能智能合并
        const availableOptions = conflict.isBinary
            ? options.filter(o => o.value !== 'smart-merge')
            : options;

        new Setting(optionsEl)
            .addDropdown(dropdown => {
                dropdown
                    .addOptions(availableOptions.reduce((acc, o) => {
                        acc[o.value] = o.label;
                        return acc;
                    }, {} as Record<string, string>))
                    .setValue(this.selectedResolution.get(conflict.path) || 'keep-local')
                    .onChange((value) => {
                        this.selectedResolution.set(conflict.path, value);
                    });
            });

        // 查看差异按钮
        const diffButtonEl = itemEl.createDiv({ cls: 'git-sync-conflict-diff-button' });
        new Setting(diffButtonEl)
            .addButton(button => button
                .setButtonText(t('conflictViewDiff'))
                .onClick(() => {
                    if (!conflict.isBinary) {
                        new ConflictDiffModal(this.app, this.plugin, conflict).open();
                    } else {
                        new Notice(t('conflictBinaryNoDiff'));
                    }
                }));
    }

    // 应用选择的解决方案
    async applyResolutions() {
        // 转换选择到解决方案
        for (const [path, value] of this.selectedResolution) {
            this.resolutions.set(path, value as ConflictResolution);
        }

        // 执行解决
        const result = await this.conflictHandler.resolveConflicts(this.conflicts, this.resolutions);

        if (result.success > 0) {
            new Notice(t('conflictResolvedCount', {
                success: result.success,
                failed: result.failed
            }));
        }

        // 更新状态栏
        const remainingConflicts = this.plugin.stateManager.getConflictFiles().length;
        if (this.plugin.statusBar) {
            this.plugin.statusBar.setConflictCount(remainingConflicts);
        }

        // 刷新面板或关闭
        if (remainingConflicts > 0) {
            this.conflicts = [];
            this.resolutions.clear();
            this.selectedResolution.clear();
            await this.loadConflicts();
            // 重新渲染
            this.contentEl.empty();
            await this.onOpen();
        } else {
            this.close();
        }
    }
}

// 冲突差异查看面板
export class ConflictDiffModal extends Modal {
    plugin: GitSyncPlugin;
    conflict: ConflictFile;

    constructor(app: App, plugin: GitSyncPlugin, conflict: ConflictFile) {
        super(app);
        this.plugin = plugin;
        this.conflict = conflict;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.addClass('git-sync-conflict-diff-modal');

        // 标题
        contentEl.createEl('h2', { text: t('conflictDiffTitle') });
        contentEl.createEl('p', {
            text: this.conflict.path,
            cls: 'git-sync-conflict-diff-path'
        });

        // 差异容器
        const diffContainer = contentEl.createDiv({ cls: 'git-sync-conflict-diff-container' });

        // 本地版本
        const localSection = diffContainer.createDiv({ cls: 'git-sync-conflict-diff-section' });
        localSection.createEl('h3', { text: t('conflictLocalVersion') });

        const localContentEl = localSection.createDiv({ cls: 'git-sync-conflict-diff-content' });
        MarkdownRenderer.render(
            this.app,
            this.conflict.localContent,
            localContentEl,
            this.conflict.path,
            new Component()
        );

        // 远程版本
        const remoteSection = diffContainer.createDiv({ cls: 'git-sync-conflict-diff-section' });
        remoteSection.createEl('h3', { text: t('conflictRemoteVersion') });

        const remoteContentEl = remoteSection.createDiv({ cls: 'git-sync-conflict-diff-content' });
        MarkdownRenderer.render(
            this.app,
            this.conflict.remoteContent,
            remoteContentEl,
            this.conflict.path,
            new Component()
        );

        // 关闭按钮
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('close'))
                .onClick(() => {
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}