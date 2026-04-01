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

    // 对路径中的每个组件进行编码，但保留 /
    // 例如: "sadais/pr/file.md" -> "sadais/pr/file.md"
    // 例如: "sadais/pr/file with space.md" -> "sadais/pr/file%20with%20space.md"
    private encodePath(path: string): string {
        return path.split('/').map(encodeURIComponent).join('/');
    }

    // 构建 Contents API URL
    private buildContentsUrl(owner: string, repo: string, path: string): string {
        return `https://api.github.com/repos/${owner}/${repo}/contents/${this.encodePath(path)}`;
    }

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

    // 获取文件内容（优先使用 Git Blob API，避免 Contents API 的 URL 编码问题）
    // blobSha: 文件的 git blob SHA（可选，如果不提供会自动通过 Tree API 获取）
    async getFile(options: GetFileOptions, blobSha?: string): Promise<GitHubFile | null> {
        if (!this.octokit) return null;

        // 获取 blobSha（如果没有提供）
        let sha = blobSha;
        if (!sha) {
            sha = await this.getFileSha(options.owner, options.repo, options.path);
        }

        // 使用 Git Blob API（更可靠，避免 URL 编码问题）
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
                // 404 表示文件不存在，是预期行为，不打印错误
                if (error.status !== 404) {
                    console.error('[Git Sync] Failed to get file blob:', options.path, error);
                }
                return null;
            }
        }

        // 没有 blobSha 且无法获取（文件可能不存在）
        return null;
    }

    
    // 上传/更新文件（使用原生 fetch 绕过 Octokit 的 URL 编码问题）
    async uploadFile(options: UploadFileOptions, retryCount = 0): Promise<{ sha: string; path: string } | null> {
        if (!this.octokit || !this.token) return null;

        const maxRetries = 3;

        try {
            const branch = options.branch || 'main';
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
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    sha: data.content.sha,
                    path: data.content.path
                };
            }

            // 409 Conflict: SHA 不匹配，重新获取 SHA 并重试
            if (response.status === 409 && retryCount < maxRetries) {
                console.log(`SHA conflict for ${options.path}, retrying (${retryCount + 1}/${maxRetries})...`);

                // 使用 getFileSha（通过 Tree API）获取远程文件 SHA
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);

                // 使用新的 SHA 重试
                const newOptions = { ...options, sha: newSha || undefined };
                return this.uploadFile(newOptions, retryCount + 1);
            }

            // 403 Forbidden: GitHub 规则检查超时，等待后重试
            if (response.status === 403 && retryCount < maxRetries) {
                console.log(`GitHub rule check timeout for ${options.path}, retrying (${retryCount + 1}/${maxRetries})...`);

                // 等待 GitHub 完成检查
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));

                return this.uploadFile(options, retryCount + 1);
            }

            // 422 Unprocessable Content: 文件已存在但未提供 SHA
            if (response.status === 422 && retryCount < maxRetries) {
                console.log(`SHA missing for ${options.path}, retrying (${retryCount + 1}/${maxRetries})...`);

                // 使用 Contents API 获取 SHA（单次请求，快速）
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);

                if (newSha) {
                    const newOptions = { ...options, sha: newSha };
                    return this.uploadFile(newOptions, retryCount + 1);
                }

                // 如果获取不到 SHA，说明文件确实不存在（可能是并发操作）
                // 作为新文件上传（不带 SHA）
                console.warn(`[Git Sync] Cannot get SHA for ${options.path}, uploading as new file.`);
                const newOptions = { ...options };
                delete newOptions.sha;
                return this.uploadFile(newOptions, retryCount + 1);
            }

            const errorText = await response.text();
            console.error('Failed to upload file:', response.status, errorText);
            return null;
        } catch (error) {
            console.error('Failed to upload file:', error);
            return null;
        }
    }

    // 删除文件（使用原生 fetch 绕过 Octokit 的 URL 编码问题）
    async deleteFile(options: DeleteFileOptions, retryCount = 0): Promise<boolean> {
        if (!this.octokit || !this.token) return false;

        const maxRetries = 2;

        try {
            const branch = options.branch || 'main';
            const url = this.buildContentsUrl(options.owner, options.repo, options.path);

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify({
                    message: options.message,
                    sha: options.sha,
                    branch: branch
                })
            });

            if (response.ok) {
                return true;
            }

            // 404 表示文件不存在，视为成功
            if (response.status === 404) {
                return true;
            }

            // 409 Conflict: SHA 不匹配，重新获取 SHA 并重试
            if (response.status === 409 && retryCount < maxRetries) {
                console.log(`SHA conflict when deleting ${options.path}, retrying (${retryCount + 1}/${maxRetries})...`);

                // 等待一小段时间让 GitHub 完成之前的操作
                await new Promise(resolve => setTimeout(resolve, 500));

                // 重新获取远程文件 SHA
                const newSha = await this.getFileSha(options.owner, options.repo, options.path);

                if (!newSha) {
                    // 文件已不存在，视为成功
                    return true;
                }

                // 使用新的 SHA 重试
                const newOptions = { ...options, sha: newSha };
                return this.deleteFile(newOptions, retryCount + 1);
            }

            console.error('Failed to delete file:', response.status, await response.text());
            return false;
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
            console.log('[Git Sync] Default branch:', defaultBranch);

            // 使用 repos.getBranch 获取分支信息（比 git.getRef 更可靠）
            console.log('[Git Sync] Getting branch:', defaultBranch);
            const { data: branchData } = await this.octokit.repos.getBranch({
                owner,
                repo,
                branch: defaultBranch
            });
            console.log('[Git Sync] Branch commit SHA:', branchData.commit.sha);

            // 获取递归文件树
            const { data: treeData } = await this.octokit.git.getTree({
                owner,
                repo,
                tree_sha: branchData.commit.sha,
                recursive: 'true'
            });
            console.log('[Git Sync] Tree data count:', treeData.tree.length);

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

            console.log('[Git Sync] Files count:', files.length);
            return files;
        } catch (error: any) {
            console.error('[Git Sync] Failed to get all files:', error.message || error);
            console.error('[Git Sync] Error status:', error.status);
            console.error('[Git Sync] Error details:', error);
            return [];
        }
    }

    // 获取单个文件的 SHA（使用 Contents API，单次请求，高效）
    async getFileSha(owner: string, repo: string, path: string): Promise<string | null> {
        if (!this.token) return null;

        try {
            // 使用原生 fetch，正确处理 URL 编码
            const url = this.buildContentsUrl(owner, repo, path);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            if (response.ok) {
                const data = await response.json();
                // Contents API 返回的数据中包含 sha 字段
                return data.sha;
            }

            // 404 表示文件不存在
            if (response.status === 404) {
                return null;
            }

            // 其他错误
            console.error('[Git Sync] Failed to get file SHA:', path, response.status);
            return null;
        } catch (error) {
            console.error('[Git Sync] Failed to get file SHA:', path, error);
            return null;
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
