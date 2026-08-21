const fs = require('fs-extra');
const path = require('path');
const { glob } = require('glob');
const config = require('../config');
const logger = require('./logger');

/**
 * Scan directory for files matching criteria
 * @param {string} directory - Directory to scan
 * @returns {Promise<Array>} Array of file paths
 */
async function scanDirectory(directory) {
  try {
    logger.info(`Scanning directory: ${directory}`);

    // Build glob pattern for file extensions
    const extensions = config.analyzeExtensions.join(',');
    const pattern = `**/*{${extensions}}`;

    // Get all matching files
    const files = await glob(pattern, {
      cwd: directory,
      absolute: true,
      ignore: config.excludePatterns,
      nodir: true
    });

    logger.info(`Found ${files.length} files to analyze`);
    return files;
  } catch (error) {
    logger.error('Error scanning directory:', error);
    throw new Error(`Failed to scan directory: ${error.message}`);
  }
}

/**
 * Read file content with size limit
 * @param {string} filePath - Path to file
 * @returns {Promise<string|null>} File content or null if too large
 */
async function readFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const fileSizeKB = stats.size / 1024;

    // Skip files that are too large
    if (fileSizeKB > config.maxFileSizeKB) {
      logger.warn(`Skipping large file: ${filePath} (${fileSizeKB.toFixed(2)} KB)`);
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    // Skip binary files or files that can't be read as text
    if (error.code === 'ENOENT') {
      logger.warn(`File not found: ${filePath}`);
    } else {
      logger.debug(`Could not read file as text: ${filePath}`);
    }
    return null;
  }
}

/**
 * Get relative path from base directory
 * @param {string} filePath - Absolute file path
 * @param {string} baseDir - Base directory
 * @returns {string} Relative path
 */
function getRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath);
}

/**
 * Check if file should be analyzed based on extension
 * @param {string} filePath - File path
 * @returns {boolean} True if file should be analyzed
 */
function shouldAnalyzeFile(filePath) {
  const ext = path.extname(filePath);
  return config.analyzeExtensions.includes(ext);
}

/**
 * Get file metadata
 * @param {string} filePath - File path
 * @returns {Promise<Object>} File metadata
 */
async function getFileMetadata(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      path: filePath,
      size: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2),
      modified: stats.mtime,
      extension: path.extname(filePath)
    };
  } catch (error) {
    logger.error(`Error getting file metadata for ${filePath}:`, error);
    return null;
  }
}

/**
 * Count lines in file content
 * @param {string} content - File content
 * @returns {number} Number of lines
 */
function countLines(content) {
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Get line number for a match position
 * @param {string} content - File content
 * @param {number} position - Character position in content
 * @returns {number} Line number (1-based)
 */
function getLineNumber(content, position) {
  const lines = content.substring(0, position).split('\n');
  return lines.length;
}

/**
 * Extract code snippet around a line
 * @param {string} content - File content
 * @param {number} lineNumber - Target line number (1-based)
 * @param {number} contextLines - Number of context lines before/after
 * @returns {Object} Code snippet with line numbers
 */
function getCodeSnippet(content, lineNumber, contextLines = 2) {
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);

  const snippet = lines.slice(startLine, endLine);
  const snippetWithNumbers = snippet.map((line, index) => {
    const actualLineNumber = startLine + index + 1;
    const marker = actualLineNumber === lineNumber ? '>' : ' ';
    return `${marker} ${actualLineNumber}: ${line}`;
  }).join('\n');

  return {
    snippet: snippetWithNumbers,
    startLine: startLine + 1,
    endLine: endLine,
    targetLine: lineNumber
  };
}

/**
 * Batch read multiple files
 * @param {Array<string>} filePaths - Array of file paths
 * @returns {Promise<Array>} Array of {path, content} objects
 */
async function batchReadFiles(filePaths) {
  const results = [];

  for (const filePath of filePaths) {
    const content = await readFile(filePath);
    if (content !== null) {
      results.push({
        path: filePath,
        content
      });
    }
  }

  return results;
}

module.exports = {
  scanDirectory,
  readFile,
  getRelativePath,
  shouldAnalyzeFile,
  getFileMetadata,
  countLines,
  getLineNumber,
  getCodeSnippet,
  batchReadFiles
};

// Made with Bob
