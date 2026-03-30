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

    // 上传/更新文件
    async uploadFile(options: UploadFileOptions): Promise<{ sha: string; path: string } | null> {
        if (!this.octokit) return null;

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
        } catch (error) {
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

    // 递归获取仓库所有文件
    async getAllFiles(owner: string, repo: string, path: string = ''): Promise<GitHubFile[]> {
        if (!this.octokit) return [];

        const files: GitHubFile[] = [];
        
        try {
            const items = await this.getDirectory({ owner, repo, path });

            for (const item of items) {
                if (item.type === 'file') {
                    files.push(item);
                } else if (item.type === 'dir') {
                    const subFiles = await this.getAllFiles(owner, repo, item.path);
                    files.push(...subFiles);
                }
            }
        } catch (error) {
            console.error('Failed to get all files:', error);
        }

        return files;
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
