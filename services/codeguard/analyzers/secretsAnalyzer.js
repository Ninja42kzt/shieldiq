/**
 * Secrets Analyzer
 * Detects hardcoded secrets, API keys, passwords, and credentials
 */

const { getPatterns } = require('../utils/patterns');
const logger = require('../utils/logger');

/**
 * Analyze file content for hardcoded secrets
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {Array} Array of detected vulnerabilities
 */
function analyzeSecrets(content, filePath) {
  const vulnerabilities = [];
  const secretPatterns = getPatterns('secrets');
  const lines = content.split('\n');

  secretPatterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    lines.forEach((line, index) => {
      const matches = line.matchAll(regex);
      
      for (const match of matches) {
        // Skip if it's in a comment explaining the pattern
        if (isInComment(line, match.index)) {
          continue;
        }

        // Skip if it's an example or placeholder
        if (isPlaceholder(match[0])) {
          continue;
        }

        vulnerabilities.push({
          type: 'secret',
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          file: filePath,
          line: index + 1,
          code: line.trim(),
          match: match[0],
          recommendation: getRecommendation(pattern.name)
        });

        logger.debug(`Secret detected: ${pattern.name} in ${filePath}:${index + 1}`);
      }
    });
  });

  return vulnerabilities;
}

/**
 * Check if match is within a comment
 * @param {string} line - Line of code
 * @param {number} matchIndex - Index of match in line
 * @returns {boolean} True if in comment
 */
function isInComment(line, matchIndex) {
  const beforeMatch = line.substring(0, matchIndex);
  
  // Check for single-line comments
  if (beforeMatch.includes('//')) {
    return true;
  }
  
  // Check for multi-line comment start
  if (beforeMatch.includes('/*') && !beforeMatch.includes('*/')) {
    return true;
  }
  
  return false;
}

/**
 * Check if the matched value is a placeholder or example
 * @param {string} value - Matched value
 * @returns {boolean} True if placeholder
 */
function isPlaceholder(value) {
  const placeholderPatterns = [
    /^(xxx|yyy|zzz|example|sample|test|demo|placeholder|your[-_])/i,
    /^(12345|00000|11111)/,
    /^[*]{4,}$/,
    /^[x]{4,}$/i,
    /\.\.\./
  ];

  return placeholderPatterns.some(pattern => pattern.test(value));
}

/**
 * Get security recommendation for detected secret type
 * @param {string} secretType - Type of secret detected
 * @returns {string} Security recommendation
 */
function getRecommendation(secretType) {
  const recommendations = {
    'AWS Access Key': 'Store AWS credentials in environment variables or AWS credentials file. Use IAM roles for EC2/Lambda.',
    'AWS Secret Key': 'Store AWS credentials in environment variables or AWS credentials file. Use IAM roles for EC2/Lambda.',
    'GitHub Token': 'Store GitHub tokens in environment variables. Use GitHub Secrets for CI/CD workflows.',
    'Generic API Key': 'Store API keys in environment variables or secure configuration management system.',
    'Generic Secret': 'Store secrets in environment variables or use a secrets management service like HashiCorp Vault.',
    'Password in Code': 'Never hardcode passwords. Use environment variables and secure password hashing (bcrypt, argon2).',
    'Private Key': 'Store private keys securely outside of code repository. Use key management services.',
    'JWT Token': 'Never hardcode JWT tokens. Generate them dynamically and store securely.',
    'Database Connection String': 'Store database credentials in environment variables. Use connection pooling and secure protocols.',
    'Slack Token': 'Store Slack tokens in environment variables or secure configuration management.'
  };

  return recommendations[secretType] || 'Store sensitive values in environment variables or secure configuration management system.';
}

/**
 * Analyze multiple files for secrets
 * @param {Array} files - Array of file objects with path and content
 * @returns {Object} Analysis results with vulnerabilities grouped by severity
 */
function analyzeMultipleFiles(files) {
  const allVulnerabilities = [];
  
  try {
    files.forEach(file => {
      try {
        const vulnerabilities = analyzeSecrets(file.content, file.path);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error('=== SECRETS ANALYZER FILE ERROR ===');
        console.error('File:', file.path);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('===================================');
        throw error;
      }
    });

    return {
      total: allVulnerabilities.length,
      vulnerabilities: allVulnerabilities,
      bySeverity: groupBySeverity(allVulnerabilities),
      byType: groupByType(allVulnerabilities)
    };
  } catch (error) {
    console.error('=== SECRETS ANALYZER MULTIPLE FILES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=============================================');
    throw error;
  }
}

/**
 * Group vulnerabilities by severity
 * @param {Array} vulnerabilities - Array of vulnerabilities
 * @returns {Object} Vulnerabilities grouped by severity
 */
function groupBySeverity(vulnerabilities) {
  return vulnerabilities.reduce((acc, vuln) => {
    if (!acc[vuln.severity]) {
      acc[vuln.severity] = [];
    }
    acc[vuln.severity].push(vuln);
    return acc;
  }, {});
}

/**
 * Group vulnerabilities by type
 * @param {Array} vulnerabilities - Array of vulnerabilities
 * @returns {Object} Vulnerabilities grouped by type
 */
function groupByType(vulnerabilities) {
  return vulnerabilities.reduce((acc, vuln) => {
    if (!acc[vuln.name]) {
      acc[vuln.name] = [];
    }
    acc[vuln.name].push(vuln);
    return acc;
  }, {});
}

/**
 * Get summary statistics for secrets analysis
 * @param {Array} vulnerabilities - Array of vulnerabilities
 * @returns {Object} Summary statistics
 */
function getSummary(vulnerabilities) {
  const bySeverity = groupBySeverity(vulnerabilities);
  
  return {
    total: vulnerabilities.length,
    critical: (bySeverity.critical || []).length,
    high: (bySeverity.high || []).length,
    medium: (bySeverity.medium || []).length,
    low: (bySeverity.low || []).length,
    types: Object.keys(groupByType(vulnerabilities))
  };
}

module.exports = {
  analyzeSecrets,
  analyzeMultipleFiles,
  getSummary,
  groupBySeverity,
  groupByType
};

// Made with Bob