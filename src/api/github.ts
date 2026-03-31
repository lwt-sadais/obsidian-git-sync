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

export class GitHubClient {
    private octokit: Octokit | null = null;
    private token: string | null = null;

    // 初始化客户端
    async initialize(token: string): Promise<boolean> {
        this.token = token;
        this.octokit = new Octokit({
            auth: token,
            userAgent: 'obsidian-git-sync/0.1.0'
        });

        try {
            // 验证 token 是否有效
            await this.octokit.users.getAuthenticated();
            return true;
        } catch (error) {
            this.octokit = null;
            this.token = null;
            return false;
        }
    }

    // 获取当前用户信息
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
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    // 创建仓库
    async createRepository(options: CreateRepoOptions): Promise<GitHubRepository | null> {
        if (!this.octokit) return null;

        try {
            const { data } = await this.octokit.repos.createForAuthenticatedUser({
                name: options.name,
                description: options.description || 'Obsidian Vault Sync',
                private: options.private !== false, // 默认私有
                auto_init: options.auto_init || true
            });

            return {
                id: data.id,
                name: data.name,
                full_name: data.full_name,
                owner: {
                    login: data.owner.login
                },
                private: data.private,
                html_url: data.html_url,
                clone_url: data.clone_url,
                description: data.description
            };
        } catch (error) {
            console.error('Failed to create repository:', error);
            return null;
        }
    }

    // 获取用户的仓库列表
    async listRepositories(): Promise<GitHubRepository[]> {
        if (!this.octokit) return [];

        try {
            const { data } = await this.octokit.repos.listForAuthenticatedUser({
                type: 'owner',
                sort: 'updated',
                per_page: 100
            });

            return data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                owner: {
                    login: repo.owner.login
                },
                private: repo.private,
                html_url: repo.html_url,
                clone_url: repo.clone_url,
                description: repo.description
            }));
        } catch (error) {
            console.error('Failed to list repositories:', error);
            return [];
        }
    }

    // 检查仓库是否存在
    async repositoryExists(owner: string, repo: string): Promise<boolean> {
        if (!this.octokit) return false;

        try {
            await this.octokit.repos.get({ owner, repo });
            return true;
        } catch (error) {
            return false;
        }
    }

    // 获取文件内容
    async getFile(options: GetFileOptions): Promise<GitHubFile | null> {
        if (!this.octokit) return null;

        try {
            const { data } = await this.octokit.repos.getContent({
                owner: options.owner,
                repo: options.repo,
                path: options.path,
                ref: options.ref
            });

            if (Array.isArray(data)) {
                // 这是一个目录
                return null;
            }

            return {
                name: data.name,
                path: data.path,
                sha: data.sha,
                size: data.size,
                url: data.url,
                html_url: data.html_url,
                git_url: data.git_url,
                download_url: data.download_url,
                type: data.type as 'file' | 'dir' | 'symlink' | 'submodule',
                content: data.content,
                encoding: data.encoding
            };
        } catch (error) {
            console.error('Failed to get file:', error);
            return null;
        }
    }

    // 获取目录内容
    async getDirectory(options: GetFileOptions): Promise<GitHubFile[]> {
        if (!this.octokit) return [];

        try {
            const { data } = await this.octokit.repos.getContent({
                owner: options.owner,
                repo: options.repo,
                path: options.path,
                ref: options.ref
            });

            if (!Array.isArray(data)) {
                return [];
            }

            return data.map(item => ({
                name: item.name,
                path: item.path,
                sha: item.sha,
                size: item.size,
                url: item.url,
                html_url: item.html_url,
                git_url: item.git_url,
                download_url: item.download_url,
                type: item.type as 'file' | 'dir' | 'symlink' | 'submodule'
            }));
        } catch (error) {
            console.error('Failed to get directory:', error);
            return [];
        }
    }

    // 上传/更新文件（带重试机制处理 409 冲突）
    async uploadFile(options: UploadFileOptions, retryCount = 0): Promise<{ sha: string; path: string } | null> {
        if (!this.octokit) return null;

        const maxRetries = 2;

        try {
            const params: any = {
                owner: options.owner,
                repo: options.repo,
                path: options.path,
                message: options.message,
                content: options.content,
                branch: options.branch || 'main'
            };

            if (options.sha) {
                params.sha = options.sha;
            }

            const { data } = await this.octokit.repos.createOrUpdateFileContents(params);

            return {
                sha: data.content.sha,
                path: data.content.path
            };
        } catch (error: any) {
            // 409 Conflict: SHA 不匹配，重新获取 SHA 并重试
            if (error.status === 409 && retryCount < maxRetries) {
                console.log(`SHA conflict for ${options.path}, retrying (${retryCount + 1}/${maxRetries})...`);

                // 重新获取远程文件 SHA
                const existingFile = await this.getFile({
                    owner: options.owner,
                    repo: options.repo,
                    path: options.path
                });

                // 使用新的 SHA 重试
                const newOptions = { ...options, sha: existingFile?.sha };
                return this.uploadFile(newOptions, retryCount + 1);
            }

            console.error('Failed to upload file:', error);
            return null;
        }
    }

    // 删除文件
    async deleteFile(options: DeleteFileOptions): Promise<boolean> {
        if (!this.octokit) return false;

        try {
            await this.octokit.repos.deleteFile({
                owner: options.owner,
                repo: options.repo,
                path: options.path,
                message: options.message,
                sha: options.sha,
                branch: options.branch || 'main'
            });

            return true;
        } catch (error) {
            console.error('Failed to delete file:', error);
            return false;
        }
    }

    // 获取仓库默认分支
    async getDefaultBranch(owner: string, repo: string): Promise<string> {
        if (!this.octokit) return 'main';

        try {
            const { data } = await this.octokit.repos.get({ owner, repo });
            return data.default_branch || 'main';
        } catch (error) {
            console.error('Failed to get default branch:', error);
            return 'main';
        }
    }

    // 获取仓库所有文件（使用 Git Tree API，一次请求获取所有文件）
    async getAllFiles(owner: string, repo: string): Promise<GitHubFile[]> {
        if (!this.octokit) return [];

        try {
            // 获取默认分支
            const defaultBranch = await this.getDefaultBranch(owner, repo);

            // 获取默认分支的最新 commit
            const { data: refData } = await this.octokit.git.getRef({
                owner,
                repo,
                ref: `heads/${defaultBranch}`
            });

            // 获取递归文件树
            const { data: treeData } = await this.octokit.git.getTree({
                owner,
                repo,
                tree_sha: refData.object.sha,
                recursive: 'true'
            });

            // 过滤出文件（排除目录）
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

            return files;
        } catch (error) {
            console.error('Failed to get all files:', error);
            return [];
        }
    }

    // 获取 Token
    getToken(): string | null {
        return this.token;
    }

    // 清除认证
    clearAuth(): void {
        this.octokit = null;
        this.token = null;
    }
}
