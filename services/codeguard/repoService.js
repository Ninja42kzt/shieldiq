const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Validate GitHub repository URL
 * @param {string} repoUrl - Repository URL
 * @returns {boolean} True if valid
 */
function isValidGitHubUrl(repoUrl) {
  const githubPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/i;
  return githubPattern.test(repoUrl);
}

/**
 * Extract repository name from URL
 * @param {string} repoUrl - Repository URL
 * @returns {string} Repository name
 */
function extractRepoName(repoUrl) {
  const match = repoUrl.match(/github\.com\/([\w-]+)\/([\w.-]+)/i);
  if (match) {
    return `${match[1]}_${match[2].replace('.git', '')}`;
  }
  return 'unknown_repo';
}

/**
 * Clone a GitHub repository
 * @param {string} repoUrl - Repository URL
 * @returns {Promise<Object>} Clone result with path and metadata
 */
async function cloneRepository(repoUrl, branch = 'main') {
  // Validate URL
  if (!isValidGitHubUrl(repoUrl)) {
    throw new Error('Invalid GitHub repository URL');
  }

  // Ensure temp directory exists
  await fs.ensureDir(config.tempDir);

  // Generate unique directory for this clone
  const repoId = uuidv4();
  const repoName = extractRepoName(repoUrl);
  const clonePath = path.join(config.tempDir, `${repoName}_${repoId}`);

  logger.info(`Cloning repository: ${repoUrl} to ${clonePath}`);

  try {
    const git = simpleGit();

    // Add authentication if GitHub token is provided
    let authUrl = repoUrl;
    if (config.githubToken) {
      authUrl = repoUrl.replace('https://', `https://${config.githubToken}@`);
    }

    // Configure git options - try with specified branch, fall back to default
    const cloneWithBranch = async (targetBranch) => {
      const opts = { '--depth': 1, '--single-branch': null };
      if (targetBranch) opts['--branch'] = targetBranch;
      return git.clone(authUrl, clonePath, opts);
    };

    // Clone with timeout, with branch fallback
    const timeoutMs = config.cloneTimeoutMs;
    const withTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clone operation timed out')), timeoutMs))
    ]);

    try {
      await withTimeout(cloneWithBranch(branch));
    } catch (branchError) {
      // If branch not found, retry without specifying branch (use repo default)
      if (branchError.message && (branchError.message.includes('Remote branch') || branchError.message.includes('not found') || branchError.message.includes('fatal'))) {
        logger.warn(`Branch '${branch}' not found, cloning default branch`);
        if (await fs.pathExists(clonePath)) await fs.remove(clonePath);
        await withTimeout(cloneWithBranch(null));
      } else {
        throw branchError;
      }
    }

    // Check repository size
    const repoSize = await getDirectorySize(clonePath);
    const repoSizeMB = repoSize / (1024 * 1024);

    if (repoSizeMB > config.maxRepoSizeMB) {
      await cleanupRepository(clonePath);
      throw new Error(`Repository size (${repoSizeMB.toFixed(2)} MB) exceeds maximum allowed size (${config.maxRepoSizeMB} MB)`);
    }

    logger.info(`Repository cloned successfully. Size: ${repoSizeMB.toFixed(2)} MB`);

    return {
      repoId,
      repoUrl,
      repoName,
      clonePath,
      size: repoSize,
      sizeMB: repoSizeMB.toFixed(2),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Cleanup on error
    if (await fs.pathExists(clonePath)) {
      await cleanupRepository(clonePath);
    }

    logger.error(`Failed to clone repository: ${error.message}`);
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

/**
 * Get directory size recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} Size in bytes
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  async function calculateSize(currentPath) {
    const stats = await fs.stat(currentPath);

    if (stats.isFile()) {
      totalSize += stats.size;
    } else if (stats.isDirectory()) {
      const files = await fs.readdir(currentPath);
      for (const file of files) {
        await calculateSize(path.join(currentPath, file));
      }
    }
  }

  await calculateSize(dirPath);
  return totalSize;
}

/**
 * Clean up cloned repository
 * @param {string} clonePath - Path to cloned repository
 * @returns {Promise<void>}
 */
async function cleanupRepository(clonePath) {
  try {
    if (await fs.pathExists(clonePath)) {
      await fs.remove(clonePath);
      logger.info(`Cleaned up repository: ${clonePath}`);
    }
  } catch (error) {
    logger.error(`Failed to cleanup repository: ${error.message}`);
  }
}

/**
 * Clean up old repositories from temp directory
 * @param {number} maxAgeHours - Maximum age in hours
 * @returns {Promise<number>} Number of directories cleaned
 */
async function cleanupOldRepositories(maxAgeHours = 24) {
  try {
    await fs.ensureDir(config.tempDir);
    const entries = await fs.readdir(config.tempDir, { withFileTypes: true });
    let cleanedCount = 0;

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(config.tempDir, entry.name);
        const stats = await fs.stat(dirPath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await fs.remove(dirPath);
          cleanedCount++;
          logger.info(`Cleaned up old repository: ${entry.name}`);
        }
      }
    }

    logger.info(`Cleaned up ${cleanedCount} old repositories`);
    return cleanedCount;
  } catch (error) {
    logger.error(`Failed to cleanup old repositories: ${error.message}`);
    return 0;
  }
}

/**
 * Get repository metadata
 * @param {string} clonePath - Path to cloned repository
 * @returns {Promise<Object>} Repository metadata
 */
async function getRepositoryMetadata(clonePath) {
  try {
    const git = simpleGit(clonePath);
    
    // Get basic info
    const log = await git.log({ maxCount: 1 });
    const branch = await git.branchLocal();
    
    return {
      currentBranch: branch.current,
      lastCommit: log.latest ? {
        hash: log.latest.hash,
        message: log.latest.message,
        author: log.latest.author_name,
        date: log.latest.date
      } : null
    };
  } catch (error) {
    logger.warn(`Could not get repository metadata: ${error.message}`);
    return null;
  }
}

module.exports = {
  cloneRepository,
  cleanupRepository,
  cleanupOldRepositories,
  isValidGitHubUrl,
  extractRepoName,
  getDirectorySize,
  getRepositoryMetadata
};

// Made with Bob
