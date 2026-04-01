/**
 * 插件设置类型定义
 */

/**
 * 插件设置接口
 */
export interface GitSyncSettings {
    // GitHub 认证
    githubToken: string;
    githubUsername: string;

    // 仓库信息
    repoOwner: string;
    repoName: string;

    // 同步设置
    autoSync: boolean;
    fileSizeLimit: number;
    syncOnStartup: boolean;

    // 排除规则
    excludedPaths: string[];
    excludedExtensions: string[];
}