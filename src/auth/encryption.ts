// 简单的 Token 加密存储
// 注意：这不是真正的加密，只是混淆存储，安全性依赖于用户的环境

import { logger } from '../utils/logger';

const ENCRYPTION_KEY = 'obsidian-git-sync-key';

// 编码为 Base64（浏览器兼容）
function base64Encode(str: string): string {
    return btoa(unescape(encodeURIComponent(str)));
}

// 从 Base64 解码（浏览器兼容）
function base64Decode(str: string): string {
    return decodeURIComponent(escape(atob(str)));
}

// 简单的 XOR 加密
function xorEncrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(
            text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }
    return result;
}

// 加密 Token
export function encryptToken(token: string): string {
    const encrypted = xorEncrypt(token, ENCRYPTION_KEY);
    return base64Encode(encrypted);
}

// 解密 Token
export function decryptToken(encryptedToken: string): string {
    try {
        const decoded = base64Decode(encryptedToken);
        return xorEncrypt(decoded, ENCRYPTION_KEY);
    } catch (error) {
        logger.error('Failed to decrypt token:', error);
        return '';
    }
}

// 检查是否为加密后的 Token
export function isEncrypted(token: string): boolean {
    // 简单检查：加密后的 token 通常是 base64 格式
    // 而原始 token 以 'ghp_' 或 'github_pat_' 开头
    return !token.startsWith('ghp_') && !token.startsWith('github_pat_');
}
