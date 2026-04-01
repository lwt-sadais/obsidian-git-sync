/**
 * GitHub API 客户端
 */

import { Octokit } from '@octokit/rest';
import {
    GitHubUser,
    GitHubRepository,
    GitHubFile,
    CreateRepoOptions,
    UploadFileOptions,
    GetFileOptions,
    DeleteFileOptions
} from './types';
import {
    DEFAULT_BRANCH,
    GITHUB_API_VERSION,
    MAX_UPLOAD_RETRIES,
    MAX_DELETE_RETRIES,
    REPO_PAGE_SIZE,
    RETRY_WAIT_BASE_MS,
    DELETE_RETRY_WAIT_MS
} from '../constants';
import { logger } from '../utils/logger';

/**
 * GitHub API 客户端
 */
export class GitHubClient {
    private octokit: Octokit | null = null;
    private token: string | null = null;

    /**
     * 对路径中的每个组件进行编码，但保留 /
     */
    private encodePath(path: string): string {
        return path.split('/').map(encodeURIComponent).join('/');
    }

    /**
     * 构建 Contents API URL
     */
    private buildContentsUrl(owner: string, repo: string, path: string): string {
        return `https://api.github.com/repos/${owner}/${repo}/contents/${this.encodePath(path)}`;
    }

    /**
     * 初始化客户端
     */
    async initialize(token: string): Promise<boolean> {
        this.token = token;
        this.octokit = new Octokit({
            auth: token,
            userAgent: 'obsidian-git-sync/0.3.0'
        });

        try {
            await this.octokit.users.getAuthenticated();
            return true;
        } catch (error) {
            this.octokit = null;
            this.token = null;
            return false;
        }
    }

    /**
     * 获取当前用户信息
     */
    async getCurrentUser(): Promise<GitHubUser | null> {
        if (!this.octokit) return null;

        try {
            const { data } = await this.octokit.users.getAuthenticated();
            return {
                login: data.login,
                id: data.id,
                avatar_url: data.avatar_url,
                html_url: data.html_url,
                name: data.name,
                email: data.email
            };
        } catch (error) {
            logger.error('Failed to get current user:', error);
            return null;
        }
    }

    /**
     * 创建仓库
     */
    async createRepository(options: CreateRepoOptions): Promise<GitHubRepository | null> {
        if (!this.octokit) return null;

        try {
            const { data } = await this.octokit.repos.createForAuthenticatedUser({
                name: options.name,
                description: options.description || 'Obsidian Vault Sync',
                private: options.private !== false,
                auto_init: options.auto_init || true
            });

            return {
                id: data.id,
                name: data.name,
                full_name: data.full_name,
                owner: { login: data.owner.login },
                private: data.private,
                html_url: data.html_url,
                clone_url: data.clone_url,
                description: data.description
            };
        } catch (error) {
            logger.error('Failed to create repository:', error);
            return null;
        }
    }

    /**
     * 获取用户的仓库列表
     */
    async listRepositories(): Promise<GitHubRepository[]> {
        if (!this.octokit) return [];

        try {
            const { data } = await this.octokit.repos.listForAuthenticatedUser({
                type: 'owner',
                sort: 'updated',
                per_page: REPO_PAGE_SIZE
            });

            return data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                owner: { login: repo.owner.login },
                private: repo.private,
                html_url: repo.html_url,
                clone_url: repo.clone_url,
                description: repo.description
            }));
        } catch (error) {
            logger.error('Failed to list repositories:', error);
            return [];
        }
    }

    /**
     * 检查仓库是否存在
     */
    async repositoryExists(owner: string, repo: string): Promise<boolean> {
        if (!this.octokit) return false;

        try {
            await this.octokit.repos.get({ owner, repo });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取文件内容（优先使用 Git Blob API）
     */
    async getFile(options: GetFileOptions, blobSha?: string): Promise<GitHubFile | null> {
        if (!this.octokit) return null;

        let sha = blobSha;
        if (!sha) {
            sha = await this.getFileSha(options.owner, options.repo, options.path);
        }

        if (sha) {
            try {
                const { data } = await this.octokit.git.getBlob({
                    owner: options.owner,
                    repo: options.repo,
                    file_sha: sha
                });
                return {
                    name: options.path.split('/').pop() || '',
                    path: options.path,
                    sha: data.sha,
                    size: data.size,
                    url: '',
                    html_url: '',
                    git_url: '',
                    download_url: '',
                    type: 'file',
                    content: data.content,
                    encoding: data.encoding
                };
            } catch (error: any) {
                // 404 是预期行为，不记录错误
                if (error.status !== 404) {
                    logger.error('Failed to get file blob:', options.path, error);
                }
                return null;
            }
        }

        return null;
    }

    /**
     * 上传/更新文件
     */
    async uploadFile(options: UploadFileOptions, retryCount = 0): Promise<{ sha: string; path: string } | null> {
        if (!this.octokit || !this.token) return null;

        try {
            const branch = options.branch || DEFAULT_BRANCH;
            const url = this.buildContentsUrl(options.owner, options.repo, options.path);

            const body: any = {
                message: options.message,
                content: options.content,
                branch: branch
            };

            if (options.sha) {
                body.sha = options.sha;
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': GITHUB_API_VERSION
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const data = await response.json();
                return { sha: data.content.sha, path: data.content.path };
            }

            // 409 Conflict: SHA 不匹配
            if (response.status === 409 && retryCount < MAX_UPLOAD_RETRIES) {
                logger.debug(`SHA conflict for ${options.path}, retrying (${retryCount + 1}/${MAX_UPLOAD_RETRIES})...`);
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);
                const newOptions = { ...options, sha: newSha || undefined };
                return this.uploadFile(newOptions, retryCount + 1);
            }

            // 403 Forbidden: GitHub 规则检查超时
            if (response.status === 403 && retryCount < MAX_UPLOAD_RETRIES) {
                logger.debug(`GitHub rule check timeout for ${options.path}, retrying (${retryCount + 1}/${MAX_UPLOAD_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_WAIT_BASE_MS * (retryCount + 1)));
                return this.uploadFile(options, retryCount + 1);
            }

            // 422 Unprocessable Content: 文件已存在但未提供 SHA
            if (response.status === 422 && retryCount < MAX_UPLOAD_RETRIES) {
                logger.debug(`SHA missing for ${options.path}, retrying (${retryCount + 1}/${MAX_UPLOAD_RETRIES})...`);
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);

                if (newSha) {
                    const newOptions = { ...options, sha: newSha };
                    return this.uploadFile(newOptions, retryCount + 1);
                }

                logger.warn(`Cannot get SHA for ${options.path}, uploading as new file.`);
                const newOptions = { ...options };
                delete newOptions.sha;
                return this.uploadFile(newOptions, retryCount + 1);
            }

            const errorText = await response.text();
            logger.error('Failed to upload file:', response.status, errorText);
            return null;
        } catch (error) {
            logger.error('Failed to upload file:', error);
            return null;
        }
    }

    /**
     * 删除文件
     */
    async deleteFile(options: DeleteFileOptions, retryCount = 0): Promise<boolean> {
        if (!this.octokit || !this.token) return false;

        try {
            const branch = options.branch || DEFAULT_BRANCH;
            const url = this.buildContentsUrl(options.owner, options.repo, options.path);

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': GITHUB_API_VERSION
                },
                body: JSON.stringify({
                    message: options.message,
                    sha: options.sha,
                    branch: branch
                })
            });

            if (response.ok || response.status === 404) {
                return true;
            }

            // 409 Conflict: SHA 不匹配
            if (response.status === 409 && retryCount < MAX_DELETE_RETRIES) {
                logger.debug(`SHA conflict when deleting ${options.path}, retrying (${retryCount + 1}/${MAX_DELETE_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, DELETE_RETRY_WAIT_MS));
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);

                if (!newSha) {
                    return true;
                }

                const newOptions = { ...options, sha: newSha };
                return this.deleteFile(newOptions, retryCount + 1);
            }

            logger.error('Failed to delete file:', response.status, await response.text());
            return false;
        } catch (error) {
            logger.error('Failed to delete file:', error);
            return false;
        }
    }

    /**
     * 获取仓库默认分支
     */
    async getDefaultBranch(owner: string, repo: string): Promise<string> {
        if (!this.octokit) return DEFAULT_BRANCH;

        try {
            const { data } = await this.octokit.repos.get({ owner, repo });
            return data.default_branch || DEFAULT_BRANCH;
        } catch (error) {
            logger.error('Failed to get default branch:', error);
            return DEFAULT_BRANCH;
        }
    }

    /**
     * 获取仓库所有文件
     */
    async getAllFiles(owner: string, repo: string): Promise<GitHubFile[]> {
        if (!this.octokit) return [];

        try {
            const defaultBranch = await this.getDefaultBranch(owner, repo);
            logger.debug('Default branch:', defaultBranch);

            const { data: branchData } = await this.octokit.repos.getBranch({
                owner,
                repo,
                branch: defaultBranch
            });
            logger.debug('Branch commit SHA:', branchData.commit.sha);

            const { data: treeData } = await this.octokit.git.getTree({
                owner,
                repo,
                tree_sha: branchData.commit.sha,
                recursive: 'true'
            });
            logger.debug('Tree data count:', treeData.tree.length);

            const files: GitHubFile[] = treeData.tree
                .filter(item => item.type === 'blob')
                .map(item => ({
                    name: item.path?.split('/').pop() || '',
                    path: item.path || '',
                    sha: item.sha || '',
                    size: item.size || 0,
                    url: item.url || '',
                    html_url: '',
                    git_url: item.url || '',
                    download_url: '',
                    type: 'file' as const
                }));

            logger.debug('Files count:', files.length);
            return files;
        } catch (error: any) {
            logger.error('Failed to get all files:', error.message || error);
            return [];
        }
    }

    /**
     * 获取单个文件的 SHA
     */
    async getFileSha(owner: string, repo: string, path: string): Promise<string | null> {
        if (!this.token) return null;

        try {
            const url = this.buildContentsUrl(owner, repo, path);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': GITHUB_API_VERSION
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.sha;
            }

            // 404 是预期行为，不记录错误
            if (response.status === 404) {
                return null;
            }

            logger.error('Failed to get file SHA:', path, response.status);
            return null;
        } catch (error) {
            logger.error('Failed to get file SHA:', path, error);
            return null;
        }
    }

    /**
     * 获取 Token
     */
    getToken(): string | null {
        return this.token;
    }

    /**
     * 清除认证
     */
    clearAuth(): void {
        this.octokit = null;
        this.token = null;
    }
}