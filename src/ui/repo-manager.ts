import { App, Modal, Setting, Notice } from 'obsidian';
import { GitHubClient } from '../api/github';
import { GitHubRepository } from '../api/types';
import GitSyncPlugin from '../main';
import { t } from '../i18n';

// 创建仓库模态框
export class CreateRepoModal extends Modal {
    plugin: GitSyncPlugin;
    repoName: string = 'obsidian-vault';
    description: string = '';
    onCreated: (repo: GitHubRepository) => void;

    constructor(
        app: App,
        plugin: GitSyncPlugin,
        onCreated: (repo: GitHubRepository) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onCreated = onCreated;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: t('createRepoTitle') });

        new Setting(contentEl)
            .setName(t('repoName'))
            .addText(text => text
                .setPlaceholder(t('repoNamePlaceholder'))
                .setValue(this.repoName)
                .onChange(value => {
                    this.repoName = value;
                }));

        new Setting(contentEl)
            .setName(t('repoDesc'))
            .addText(text => text
                .setPlaceholder(t('repoDescPlaceholder'))
                .setValue(this.description)
                .onChange(value => {
                    this.description = value;
                }));

        new Setting(contentEl)
            .setName(t('createRepoButton'))
            .addButton(button => button
                .setButtonText(t('create'))
                .setCta()
                .onClick(async () => {
                    if (!this.repoName) {
                        new Notice(t('repoName'));
                        return;
                    }

                    const client = this.plugin.authManager.getClient();
                    if (!client) {
                        new Notice(t('pleaseLogin'));
                        this.close();
                        return;
                    }

                    new Notice(t('creatingRepo'));

                    const repo = await client.createRepository({
                        name: this.repoName,
                        description: this.description,
                        private: true,
                        auto_init: true
                    });

                    if (repo) {
                        new Notice(t('createRepoSuccess'));
                        this.onCreated(repo);
                        this.close();
                    } else {
                        new Notice(t('createRepoFailed'));
                    }
                }));

        new Setting(contentEl)
            .setName(t('cancel'))
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
}

// 选择仓库模态框
export class SelectRepoModal extends Modal {
    plugin: GitSyncPlugin;
    repos: GitHubRepository[] = [];
    selectedRepo: GitHubRepository | null = null;
    onSelected: (repo: GitHubRepository) => void;
    loading: boolean = true;

    constructor(
        app: App,
        plugin: GitSyncPlugin,
        onSelected: (repo: GitHubRepository) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSelected = onSelected;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: t('selectRepoTitle') });

        // 加载仓库列表
        await this.loadRepositories();
        this.render();
    }

    async loadRepositories() {
        const client = this.plugin.authManager.getClient();
        if (!client) {
            this.repos = [];
            this.loading = false;
            return;
        }

        this.repos = await client.listRepositories();
        // 只显示私有仓库
        this.repos = this.repos.filter(repo => repo.private);
        this.loading = false;
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('selectRepoTitle') });

        if (this.loading) {
            contentEl.createEl('p', { text: t('loadingRepos') });
            return;
        }

        if (this.repos.length === 0) {
            contentEl.createEl('p', { text: t('noPrivateRepos') });
            new Setting(contentEl)
                .addButton(button => button
                    .setButtonText(t('createNewRepo'))
                    .onClick(() => {
                        this.close();
                        const modal = new CreateRepoModal(
                            this.app,
                            this.plugin,
                            (repo) => {
                                this.onSelected(repo);
                            }
                        );
                        modal.open();
                    }));
            return;
        }

        // 显示仓库列表
        for (const repo of this.repos) {
            new Setting(contentEl)
                .setName(repo.name)
                .setDesc(repo.description || repo.full_name)
                .addButton(button => button
                    .setButtonText(t('select'))
                    .onClick(() => {
                        this.selectedRepo = repo;
                        this.onSelected(repo);
                        this.close();
                    }));
        }

        // 创建新仓库选项
        contentEl.createEl('h3', { text: 'Or create a new repository' });
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create New')
                .onClick(() => {
                    this.close();
                    const modal = new CreateRepoModal(
                        this.app,
                        this.plugin,
                        (repo) => {
                            this.onSelected(repo);
                        }
                    );
                    modal.open();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 仓库管理器
export class RepoManager {
    plugin: GitSyncPlugin;

    constructor(plugin: GitSyncPlugin) {
        this.plugin = plugin;
    }

    // 打开创建仓库模态框
    openCreateRepo(onCreated: (repo: GitHubRepository) => void) {
        const modal = new CreateRepoModal(this.plugin.app, this.plugin, onCreated);
        modal.open();
    }

    // 打开选择仓库模态框
    openSelectRepo(onSelected: (repo: GitHubRepository) => void) {
        const modal = new SelectRepoModal(this.plugin.app, this.plugin, onSelected);
        modal.open();
    }

    // 检查当前仓库是否有效
    async checkRepoValid(): Promise<boolean> {
        const client = this.plugin.authManager.getClient();
        if (!client) return false;

        const { repoOwner, repoName } = this.plugin.settings;
        if (!repoOwner || !repoName) return false;

        return await client.repositoryExists(repoOwner, repoName);
    }
}
