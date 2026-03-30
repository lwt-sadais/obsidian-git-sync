// GitHub API 类型定义

export interface GitHubUser {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
    name: string | null;
    email: string | null;
}

export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    owner: {
        login: string;
    };
    private: boolean;
    html_url: string;
    clone_url: string;
    description: string | null;
}

export interface GitHubFile {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string | null;
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    content?: string;
    encoding?: string;
}

export interface GitHubContent {
    name: string;
    path: string;
    sha: string;
    content: string;
    encoding: string;
}

export interface CreateRepoOptions {
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
}

export interface UploadFileOptions {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string; // 用于更新已有文件
    branch?: string;
}

export interface GetFileOptions {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
}

export interface DeleteFileOptions {
    owner: string;
    repo: string;
    path: string;
    message: string;
    sha: string;
    branch?: string;
}

export interface AuthStatus {
    isAuthenticated: boolean;
    username: string | null;
    token: string | null;
}
