/**
 * 设置面板
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import GitSyncPlugin from '../main';
import { encryptToken } from '../auth/encryption';
import { GitHubRepository } from '../api/types';
import { CreateRepoModal, SelectRepoModal } from '../ui/repo-manager';
import { t } from '../i18n';
import { GITHUB_FILE_SIZE_LIMIT_MB } from '../constants';

/**
 * 设置面板
 */
export class GitSyncSettingTab extends PluginSettingTab {
    plugin: GitSyncPlugin;

    constructor(app: App, plugin: GitSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: t('settingsTitle') });

        // 账户设置
        this.renderAccountSection(containerEl);

        // 仓库设置
        this.renderRepositorySection(containerEl);

        // 同步设置
        this.renderSyncSettingsSection(containerEl);
    }

    /**
     * 渲染账户设置区域
     */
    private renderAccountSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: t('account') });

        const authStatus = this.plugin.authManager.getAuthStatus();

        if (authStatus.isAuthenticated) {
            this.renderLoggedInState(containerEl, authStatus.username || 'Unknown');
        } else {
            this.renderLoginState(containerEl);
        }
    }

    /**
     * 渲染已登录状态
     */
    private renderLoggedInState(containerEl: HTMLElement, username: string): void {
        new Setting(containerEl)
            .setName(t('loggedInAs'))
            .setDesc(username)
            .addButton(button => button
                .setButtonText(t('logout'))
                .onClick(async () => {
                    this.plugin.authManager.logout();
                    this.plugin.settings.githubToken = '';
                    this.plugin.settings.githubUsername = '';
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(t('logoutSuccess'));
                }));
    }

    /**
     * 渲染登录状态
     */
    private renderLoginState(containerEl: HTMLElement): void {
        let tokenInput = '';

        new Setting(containerEl)
            .setName(t('githubToken'))
            .setDesc(t('githubTokenDesc'))
            .addText(text => text
                .setPlaceholder('ghp_xxx...')
                .setValue('')
                .onChange((value) => {
                    tokenInput = value;
                }))
            .addButton(button => button
                .setButtonText(t('login'))
                .setCta()
                .onClick(async () => {
                    if (!tokenInput) {
                        new Notice(t('pleaseLogin'));
                        return;
                    }

                    new Notice(t('verifyingToken'));

                    const success = await this.plugin.authManager.authenticateWithToken(tokenInput);
                    if (success) {
                        this.plugin.settings.githubToken = encryptToken(tokenInput);
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice(t('loginSuccess'));
                    } else {
                        new Notice(t('invalidToken'));
                    }
                }));

        // 创建 Token 链接
        containerEl.createEl('p', { text: t('createToken') });
        const link = containerEl.createEl('a', { text: t('githubTokenSettings') });
        link.href = 'https://github.com/settings/tokens/new?scopes=repo,user';
    }

    /**
     * 渲染仓库设置区域
     */
    private renderRepositorySection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: t('repository') });

        const authStatus = this.plugin.authManager.getAuthStatus();

        if (!authStatus.isAuthenticated) {
            containerEl.createEl('p', {
                text: t('pleaseLogin'),
                cls: 'setting-item-description'
            });
            return;
        }

        if (this.plugin.settings.repoOwner && this.plugin.settings.repoName) {
            this.renderConfiguredRepo(containerEl);
        } else {
            this.renderUnconfiguredRepo(containerEl);
        }
    }

    /**
     * 渲染已配置仓库
     */
    private renderConfiguredRepo(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(t('currentRepository'))
            .setDesc(`${this.plugin.settings.repoOwner}/${this.plugin.settings.repoName}`)
            .addButton(button => button
                .setButtonText(t('changeRepository'))
                .onClick(() => {
                    const modal = new SelectRepoModal(
                        this.plugin.app,
                        this.plugin,
                        (repo: GitHubRepository) => {
                            this.plugin.settings.repoOwner = repo.owner.login;
                            this.plugin.settings.repoName = repo.name;
                            this.plugin.saveSettings();
                            this.display();
                            new Notice(t('repoSelected') + repo.full_name);
                        }
                    );
                    modal.open();
                }));
    }

    /**
     * 渲染未配置仓库
     */
    private renderUnconfiguredRepo(containerEl: HTMLElement): void {
        containerEl.createEl('p', {
            text: t('noRepoConfigured'),
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName(t('createNewRepo'))
            .addButton(button => button
                .setButtonText(t('create'))
                .setCta()
                .onClick(() => {
                    const modal = new CreateRepoModal(
                        this.plugin.app,
                        this.plugin,
                        (repo: GitHubRepository) => {
                            this.plugin.settings.repoOwner = repo.owner.login;
                            this.plugin.settings.repoName = repo.name;
                            this.plugin.saveSettings();
                            this.display();
                            new Notice(t('repoCreated') + repo.full_name);
                        }
                    );
                    modal.open();
                }));

        new Setting(containerEl)
            .setName(t('selectExistingRepo'))
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(() => {
                    const modal = new SelectRepoModal(
                        this.plugin.app,
                        this.plugin,
                        (repo: GitHubRepository) => {
                            this.plugin.settings.repoOwner = repo.owner.login;
                            this.plugin.settings.repoName = repo.name;
                            this.plugin.saveSettings();
                            this.display();
                            new Notice(t('repoSelected') + repo.full_name);
                        }
                    );
                    modal.open();
                }));
    }

    /**
     * 渲染同步设置区域
     */
    private renderSyncSettingsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: t('syncSettings') });

        new Setting(containerEl)
            .setName(t('autoSync'))
            .setDesc(t('autoSyncDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('fileSizeLimit'))
            .setDesc(t('fileSizeLimitDesc'))
            .addText(text => text
                .setValue(String(this.plugin.settings.fileSizeLimit))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num <= GITHUB_FILE_SIZE_LIMIT_MB) {
                        this.plugin.settings.fileSizeLimit = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName(t('syncOnStartup'))
            .setDesc(t('syncOnStartupDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));
    }
}