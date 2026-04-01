/**
 * 默认设置值
 */

import { GitSyncSettings } from './types';
import { DEFAULT_EXCLUDED_PATHS, GITHUB_FILE_SIZE_LIMIT_MB } from '../constants';

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: GitSyncSettings = {
    githubToken: '',
    githubUsername: '',
    repoOwner: '',
    repoName: '',
    autoSync: true,
    fileSizeLimit: GITHUB_FILE_SIZE_LIMIT_MB,
    syncOnStartup: true,
    excludedPaths: [...DEFAULT_EXCLUDED_PATHS],
    excludedExtensions: []
};