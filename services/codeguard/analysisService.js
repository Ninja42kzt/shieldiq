/**
 * Analysis Service
 * Orchestrates security analysis across all analyzers
 */

const secretsAnalyzer = require('./analyzers/secretsAnalyzer');
const authAnalyzer = require('./analyzers/authAnalyzer');
const sqlAnalyzer = require('./analyzers/sqlAnalyzer');
const routeAnalyzer = require('./analyzers/routeAnalyzer');
const validationAnalyzer = require('./analyzers/validationAnalyzer');
const { scanDirectory } = require('./utils/fileScanner');
const logger = require('./utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Perform comprehensive security analysis on a repository
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeRepository(repoPath, options = {}) {
  const startTime = Date.now();
  logger.info(`Starting security analysis for: ${repoPath}`);

  try {
    // Validate repository path
    logger.debug(`Validating path: ${repoPath}`);
    await validatePath(repoPath);

    // Scan repository for files
    logger.debug(`Scanning directory for files...`);
    const files = await scanDirectory(repoPath, options.filePattern);
    logger.info(`Found ${files.length} files to analyze`);

    if (files.length === 0) {
      logger.warn('No files found to analyze');
      return {
        success: false,
        error: 'No files found to analyze',
        repository: repoPath,
        timestamp: new Date().toISOString()
      };
    }

    // Read file contents
    logger.debug(`Reading file contents...`);
    const filesWithContent = await readFiles(files, repoPath);
    logger.info(`Successfully read ${filesWithContent.length} files`);

    if (filesWithContent.length === 0) {
      logger.warn('No files could be read');
      return {
        success: false,
        error: 'No files could be read',
        repository: repoPath,
        timestamp: new Date().toISOString()
      };
    }

    // Run all analyzers
    logger.debug(`Running security analyzers...`);
    const results = await runAnalyzers(filesWithContent, options);

    // Calculate metrics
    logger.debug(`Calculating metrics...`);
    const metrics = calculateMetrics(results, filesWithContent.length);

    // Calculate duration
    const duration = Date.now() - startTime;

    const analysisResult = {
      success: true,
      repository: repoPath,
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      filesAnalyzed: filesWithContent.length,
      summary: metrics.summary,
      vulnerabilities: results.allVulnerabilities,
      byCategory: results.byCategory,
      bySeverity: results.bySeverity,
      byFile: results.byFile,
      recommendations: generateRecommendations(results),
      riskScore: calculateRiskScore(metrics.summary)
    };

    logger.info(`Analysis completed in ${duration}ms. Found ${metrics.summary.total} vulnerabilities`);
    return analysisResult;

  } catch (error) {
    logger.error(`Analysis failed: ${error.message}`);
    logger.error(error.stack);
    throw error;
  }
}

/**
 * Validate repository path exists and is accessible
 * @param {string} repoPath - Path to validate
 */
async function validatePath(repoPath) {
  try {
    const stats = await fs.stat(repoPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
  } catch (error) {
    console.error('=== VALIDATE PATH ERROR ===');
    console.error('Path:', repoPath);
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('===========================');
    throw new Error(`Invalid repository path: ${error.message}`);
  }
}

/**
 * Read contents of all files
 * @param {Array} files - Array of absolute file paths from scanDirectory
 * @param {string} basePath - Base repository path
 * @returns {Promise<Array>} Files with content
 */
async function readFiles(files, basePath) {
  const filesWithContent = [];

  for (const filePath of files) {
    try {
      // scanDirectory returns absolute paths, so use them directly
      const content = await fs.readFile(filePath, 'utf-8');
      // Get relative path for display purposes
      const relativePath = path.relative(basePath, filePath);
      
      filesWithContent.push({
        path: relativePath,
        fullPath: filePath,
        content
      });
    } catch (error) {
      console.error('=== READ FILE ERROR ===');
      console.error('File:', filePath);
      console.error('Base path:', basePath);
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('=======================');
      logger.warn(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  return filesWithContent;
}

/**
 * Run all security analyzers
 * @param {Array} files - Files with content
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Combined results from all analyzers
 */
async function runAnalyzers(files, options = {}) {
  const enabledAnalyzers = options.analyzers || [
    'secrets',
    'auth',
    'sql',
    'routes',
    'validation'
  ];

  const results = {
    allVulnerabilities: [],
    byCategory: {},
    bySeverity: {
      critical: [],
      high: [],
      medium: [],
      low: []
    },
    byFile: {}
  };

  // Run secrets analyzer
  if (enabledAnalyzers.includes('secrets')) {
    try {
      logger.debug('Running secrets analyzer...');
      const secretsResults = secretsAnalyzer.analyzeMultipleFiles(files);
      results.byCategory.secrets = secretsResults;
      results.allVulnerabilities.push(...secretsResults.vulnerabilities);
    } catch (error) {
      console.error('=== SECRETS ANALYZER ERROR ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('==============================');
      throw error;
    }
  }

  // Run authentication analyzer
  if (enabledAnalyzers.includes('auth')) {
    try {
      logger.debug('Running authentication analyzer...');
      const authResults = authAnalyzer.analyzeMultipleFiles(files);
      results.byCategory.authentication = authResults;
      results.allVulnerabilities.push(...authResults.vulnerabilities);
    } catch (error) {
      console.error('=== AUTH ANALYZER ERROR ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('===========================');
      throw error;
    }
  }

  // Run SQL injection analyzer
  if (enabledAnalyzers.includes('sql')) {
    try {
      logger.debug('Running SQL injection analyzer...');
      const sqlResults = sqlAnalyzer.analyzeMultipleFiles(files);
      results.byCategory.sql_injection = sqlResults;
      results.allVulnerabilities.push(...sqlResults.vulnerabilities);
    } catch (error) {
      console.error('=== SQL ANALYZER ERROR ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('==========================');
      throw error;
    }
  }

  // Run route analyzer
  if (enabledAnalyzers.includes('routes')) {
    try {
      logger.debug('Running route analyzer...');
      const routeResults = routeAnalyzer.analyzeMultipleFiles(files);
      results.byCategory.exposed_routes = routeResults;
      results.allVulnerabilities.push(...routeResults.vulnerabilities);
    } catch (error) {
      console.error('=== ROUTE ANALYZER ERROR ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('============================');
      throw error;
    }
  }

  // Run validation analyzer
  if (enabledAnalyzers.includes('validation')) {
    try {
      logger.debug('Running validation analyzer...');
      const validationResults = validationAnalyzer.analyzeMultipleFiles(files);
      results.byCategory.validation = validationResults;
      results.allVulnerabilities.push(...validationResults.vulnerabilities);
    } catch (error) {
      console.error('=== VALIDATION ANALYZER ERROR ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('==================================');
      throw error;
    }
  }

  // Group by severity
  try {
    results.allVulnerabilities.forEach(vuln => {
      if (results.bySeverity[vuln.severity]) {
        results.bySeverity[vuln.severity].push(vuln);
      }
    });
  } catch (error) {
    console.error('=== GROUP BY SEVERITY ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('===============================');
    throw error;
  }

  // Group by file
  try {
    results.allVulnerabilities.forEach(vuln => {
      if (!results.byFile[vuln.file]) {
        results.byFile[vuln.file] = [];
      }
      results.byFile[vuln.file].push(vuln);
    });
  } catch (error) {
    console.error('=== GROUP BY FILE ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('===========================');
    throw error;
  }

  return results;
}

/**
 * Calculate analysis metrics
 * @param {Object} results - Analysis results
 * @param {number} fileCount - Number of files analyzed
 * @returns {Object} Metrics
 */
function calculateMetrics(results, fileCount) {
  const summary = {
    total: results.allVulnerabilities.length,
    critical: results.bySeverity.critical.length,
    high: results.bySeverity.high.length,
    medium: results.bySeverity.medium.length,
    low: results.bySeverity.low.length,
    filesWithIssues: Object.keys(results.byFile).length,
    filesAnalyzed: fileCount
  };

  return {
    summary,
    averagePerFile: (summary.total / fileCount).toFixed(2),
    criticalPercentage: ((summary.critical / summary.total) * 100).toFixed(1),
    highPercentage: ((summary.high / summary.total) * 100).toFixed(1)
  };
}

/**
 * Calculate risk score (0-100)
 * @param {Object} summary - Vulnerability summary
 * @returns {number} Risk score
 */
function calculateRiskScore(summary) {
  if (summary.total === 0) return 0;

  // Weighted scoring: critical=10, high=5, medium=2, low=1
  const weightedScore = 
    (summary.critical * 10) +
    (summary.high * 5) +
    (summary.medium * 2) +
    (summary.low * 1);

  // Normalize to 0-100 scale (assuming max reasonable score is 500)
  const normalizedScore = Math.min(100, (weightedScore / 5));

  return Math.round(normalizedScore);
}

/**
 * Generate security recommendations based on findings
 * @param {Object} results - Analysis results
 * @returns {Array} Prioritized recommendations
 */
function generateRecommendations(results) {
  const recommendations = [];

  // Critical issues first
  if (results.bySeverity.critical.length > 0) {
    recommendations.push({
      priority: 'critical',
      title: 'Address Critical Security Issues Immediately',
      description: `Found ${results.bySeverity.critical.length} critical vulnerabilities that require immediate attention.`,
      actions: [
        'Review and fix all hardcoded secrets and credentials',
        'Implement proper authentication and authorization',
        'Fix command injection and code execution vulnerabilities'
      ]
    });
  }

  // High severity issues
  if (results.bySeverity.high.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Fix High-Risk Vulnerabilities',
      description: `Found ${results.bySeverity.high.length} high-risk vulnerabilities.`,
      actions: [
        'Implement input validation and sanitization',
        'Use parameterized queries for database operations',
        'Add authentication to unprotected routes'
      ]
    });
  }

  // Category-specific recommendations
  if (results.byCategory.secrets && results.byCategory.secrets.total > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Secrets Management',
      description: 'Implement proper secrets management',
      actions: [
        'Move all secrets to environment variables',
        'Use a secrets management service (e.g., HashiCorp Vault, AWS Secrets Manager)',
        'Add .env files to .gitignore',
        'Rotate any exposed credentials immediately'
      ]
    });
  }

  if (results.byCategory.sql_injection && results.byCategory.sql_injection.total > 0) {
    recommendations.push({
      priority: 'high',
      title: 'SQL Injection Prevention',
      description: 'Prevent SQL injection attacks',
      actions: [
        'Use parameterized queries or prepared statements',
        'Implement ORM with proper query builders',
        'Validate and sanitize all user input',
        'Use least privilege database accounts'
      ]
    });
  }

  if (results.byCategory.authentication && results.byCategory.authentication.total > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Authentication & Authorization',
      description: 'Strengthen authentication and authorization',
      actions: [
        'Add authentication middleware to all protected routes',
        'Implement role-based access control (RBAC)',
        'Use strong JWT secrets and set expiration times',
        'Enable secure session configuration'
      ]
    });
  }

  // General best practices
  recommendations.push({
    priority: 'medium',
    title: 'Security Best Practices',
    description: 'Implement general security best practices',
    actions: [
      'Add rate limiting to prevent abuse',
      'Implement proper error handling without exposing sensitive information',
      'Use HTTPS in production',
      'Keep dependencies up to date',
      'Implement security headers (helmet.js)',
      'Add logging and monitoring for security events'
    ]
  });

  return recommendations;
}

/**
 * Analyze specific files
 * @param {Array} filePaths - Array of file paths to analyze
 * @param {string} basePath - Base path for files
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeFiles(filePaths, basePath, options = {}) {
  logger.info(`Analyzing ${filePaths.length} specific files`);

  const filesWithContent = [];
  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(basePath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      filesWithContent.push({
        path: filePath,
        fullPath,
        content
      });
    } catch (error) {
      console.error('=== ANALYZE FILES READ ERROR ===');
      console.error('File path:', filePath);
      console.error('Base path:', basePath);
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('================================');
      logger.warn(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  const results = await runAnalyzers(filesWithContent, options);
  const metrics = calculateMetrics(results, filesWithContent.length);

  return {
    success: true,
    filesAnalyzed: filesWithContent.length,
    summary: metrics.summary,
    vulnerabilities: results.allVulnerabilities,
    byCategory: results.byCategory,
    bySeverity: results.bySeverity,
    riskScore: calculateRiskScore(metrics.summary)
  };
}

module.exports = {
  analyzeRepository,
  analyzeFiles,
  calculateRiskScore,
  generateRecommendations
};

// Made with Bob