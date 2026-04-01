import { Notice } from 'obsidian';
import { GitHubClient } from '../api/github';
import { GitHubUser, AuthStatus } from '../api/types';
import { logger } from '../utils/logger';

export class AuthManager {
    private client: GitHubClient;
    private user: GitHubUser | null = null;
    private onAuthChange: ((status: AuthStatus) => void) | null = null;

    constructor() {
        this.client = new GitHubClient();
    }

    // 设置认证状态变化回调
    setOnAuthChange(callback: (status: AuthStatus) => void): void {
        this.onAuthChange = callback;
    }

    // 使用 Token 认证
    async authenticateWithToken(token: string): Promise<boolean> {
        const success = await this.client.initialize(token);

        if (success) {
            this.user = await this.client.getCurrentUser();
            if (this.user) {
                logger.info('Authenticated as:', this.user.login);
                this.notifyAuthChange();
                return true;
            }
        }

        return false;
    }

    // 获取当前用户
    getCurrentUser(): GitHubUser | null {
        return this.user;
    }

    // 获取认证状态
    getAuthStatus(): AuthStatus {
        return {
            isAuthenticated: this.user !== null,
            username: this.user?.login || null,
            token: this.client.getToken()
        };
    }

    // 获取 GitHub 客户端
    getClient(): GitHubClient | null {
        return this.user ? this.client : null;
    }

    // 登出
    logout(): void {
        this.client.clearAuth();
        this.user = null;
        this.notifyAuthChange();
    }

    // 通知认证状态变化
    private notifyAuthChange(): void {
        if (this.onAuthChange) {
            this.onAuthChange(this.getAuthStatus());
        }
    }
}