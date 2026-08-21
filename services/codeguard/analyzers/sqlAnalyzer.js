/**
 * SQL Injection Analyzer
 * Detects SQL injection vulnerabilities and unsafe database queries
 */

const { getPatterns } = require('../utils/patterns');
const logger = require('../utils/logger');

/**
 * Analyze file content for SQL injection vulnerabilities
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {Array} Array of detected vulnerabilities
 */
function analyzeSQLInjection(content, filePath) {
  const vulnerabilities = [];
  const sqlPatterns = getPatterns('sqlInjection');
  const lines = content.split('\n');

  sqlPatterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    lines.forEach((line, index) => {
      const matches = line.matchAll(regex);
      
      for (const match of matches) {
        // Skip if it's in a comment
        if (isInComment(line, match.index)) {
          continue;
        }

        vulnerabilities.push({
          type: 'sql_injection',
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          file: filePath,
          line: index + 1,
          code: line.trim(),
          context: getContext(lines, index),
          recommendation: getRecommendation(pattern.name)
        });

        logger.debug(`SQL injection risk detected: ${pattern.name} in ${filePath}:${index + 1}`);
      }
    });
  });

  // Additional specific checks
  vulnerabilities.push(...checkORMUsage(content, filePath));
  vulnerabilities.push(...checkStoredProcedures(content, filePath));
  vulnerabilities.push(...checkDynamicTableNames(content, filePath));

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
  
  // Check for multi-line comment
  if (beforeMatch.includes('/*') && !beforeMatch.includes('*/')) {
    return true;
  }
  
  return false;
}

/**
 * Get surrounding context for better understanding
 * @param {Array} lines - All lines
 * @param {number} index - Current line index
 * @returns {string} Context lines
 */
function getContext(lines, index) {
  const start = Math.max(0, index - 2);
  const end = Math.min(lines.length, index + 3);
  return lines.slice(start, end).join('\n');
}

/**
 * Check for unsafe ORM usage patterns
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkORMUsage(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for Sequelize raw queries with concatenation
  const sequelizeRawPattern = /sequelize\.query\s*\(\s*["'`][^"'`]*\$\{|sequelize\.query\s*\(\s*["'`][^"'`]*\+/gi;
  lines.forEach((line, index) => {
    if (sequelizeRawPattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'Unsafe Sequelize Raw Query',
        severity: 'high',
        description: 'Sequelize raw query with string interpolation',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use parameterized queries with replacements: sequelize.query("SELECT * FROM users WHERE id = ?", { replacements: [userId] })'
      });
    }
  });

  // Check for TypeORM unsafe queries
  const typeormRawPattern = /\.query\s*\(\s*["'`][^"'`]*\$\{|\.createQueryBuilder\([^)]*\)\.where\s*\(\s*["'`][^"'`]*\+/gi;
  lines.forEach((line, index) => {
    if (typeormRawPattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'Unsafe TypeORM Query',
        severity: 'high',
        description: 'TypeORM query with string concatenation',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use parameterized queries: .where("user.id = :id", { id: userId })'
      });
    }
  });

  // Check for Mongoose unsafe queries (NoSQL injection)
  const mongooseUnsafePattern = /\.find\s*\(\s*req\.(body|query|params)|\.findOne\s*\(\s*req\.(body|query|params)/gi;
  lines.forEach((line, index) => {
    if (mongooseUnsafePattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'NoSQL Injection Risk',
        severity: 'high',
        description: 'Direct use of user input in MongoDB query',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Validate and sanitize input before using in queries. Use strict schema validation.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for unsafe stored procedure calls
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkStoredProcedures(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for stored procedure calls with concatenation
  const spPattern = /(EXEC|EXECUTE|CALL)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*.*\+|["'`]\s*\+\s*.*\s*\+\s*["'`].*EXEC/gi;
  lines.forEach((line, index) => {
    if (spPattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'Unsafe Stored Procedure Call',
        severity: 'high',
        description: 'Stored procedure called with concatenated parameters',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use parameterized stored procedure calls with proper parameter binding.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for dynamic table/column names
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkDynamicTableNames(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for dynamic table names
  const dynamicTablePattern = /(SELECT|INSERT|UPDATE|DELETE|FROM|INTO|JOIN)\s+.*\$\{|["'`]\s*\+\s*tableName|tableName\s*\+\s*["'`]/gi;
  lines.forEach((line, index) => {
    if (dynamicTablePattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'Dynamic Table/Column Name',
        severity: 'high',
        description: 'SQL query with dynamic table or column names',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Whitelist allowed table/column names. Never use user input directly for table/column names.'
      });
    }
  });

  // Check for ORDER BY with user input
  const orderByPattern = /ORDER\s+BY\s+.*\$\{|ORDER\s+BY\s+.*req\.(body|query|params)/gi;
  lines.forEach((line, index) => {
    if (orderByPattern.test(line)) {
      vulnerabilities.push({
        type: 'sql_injection',
        name: 'Unsafe ORDER BY Clause',
        severity: 'medium',
        description: 'ORDER BY clause with user-controlled input',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Whitelist allowed column names for sorting. Validate against allowed values.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Get security recommendation for detected issue
 * @param {string} issueType - Type of issue detected
 * @returns {string} Security recommendation
 */
function getRecommendation(issueType) {
  const recommendations = {
    'String Concatenation in Query': 'Use parameterized queries or prepared statements. Never concatenate user input into SQL queries.',
    'Direct Variable in Query': 'Use parameterized queries with placeholders (?, $1, etc.) and bind parameters separately.',
    'Unsafe Query Execution': 'Use parameterized queries instead of template literals. Example: db.query("SELECT * FROM users WHERE id = ?", [userId])',
    'Raw SQL Execution': 'Avoid raw SQL when possible. If necessary, use parameterized queries with proper escaping.'
  };

  return recommendations[issueType] || 'Always use parameterized queries or ORM methods that properly escape user input.';
}

/**
 * Analyze multiple files for SQL injection
 * @param {Array} files - Array of file objects with path and content
 * @returns {Object} Analysis results
 */
function analyzeMultipleFiles(files) {
  const allVulnerabilities = [];
  
  try {
    files.forEach(file => {
      try {
        const vulnerabilities = analyzeSQLInjection(file.content, file.path);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error('=== SQL ANALYZER FILE ERROR ===');
        console.error('File:', file.path);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('===============================');
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
    console.error('=== SQL ANALYZER MULTIPLE FILES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=========================================');
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
 * Get summary statistics
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
  analyzeSQLInjection,
  analyzeMultipleFiles,
  getSummary,
  groupBySeverity,
  groupByType
};

// Made with Bob