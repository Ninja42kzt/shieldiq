/**
 * Route Security Analyzer
 * Detects exposed routes, debug endpoints, and insecure route configurations
 */

const { getPatterns } = require('../utils/patterns');
const logger = require('../utils/logger');

/**
 * Analyze file content for route security issues
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {Array} Array of detected vulnerabilities
 */
function analyzeRoutes(content, filePath) {
  const vulnerabilities = [];
  const routePatterns = getPatterns('exposedRoutes');
  const lines = content.split('\n');

  routePatterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    lines.forEach((line, index) => {
      const matches = line.matchAll(regex);
      
      for (const match of matches) {
        // Skip if in comment
        if (isInComment(line, match.index)) {
          continue;
        }

        vulnerabilities.push({
          type: 'exposed_route',
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          file: filePath,
          line: index + 1,
          code: line.trim(),
          context: getContext(lines, index),
          recommendation: getRecommendation(pattern.name)
        });

        logger.debug(`Route issue detected: ${pattern.name} in ${filePath}:${index + 1}`);
      }
    });
  });

  // Additional route security checks
  vulnerabilities.push(...checkCORSConfiguration(content, filePath));
  vulnerabilities.push(...checkRateLimiting(content, filePath));
  vulnerabilities.push(...checkFileUploadRoutes(content, filePath));
  vulnerabilities.push(...checkAPIVersioning(content, filePath));

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
  
  if (beforeMatch.includes('//')) {
    return true;
  }
  
  if (beforeMatch.includes('/*') && !beforeMatch.includes('*/')) {
    return true;
  }
  
  return false;
}

/**
 * Get surrounding context
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
 * Check CORS configuration
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkCORSConfiguration(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for wildcard CORS
  const wildcardCORSPattern = /cors\s*\(\s*\{[^}]*origin\s*:\s*["'`]\*["'`]|\.header\s*\(\s*["'`]Access-Control-Allow-Origin["'`]\s*,\s*["'`]\*["'`]/gi;
  lines.forEach((line, index) => {
    if (wildcardCORSPattern.test(line)) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'Wildcard CORS Configuration',
        severity: 'medium',
        description: 'CORS configured to allow all origins',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Specify allowed origins explicitly. Use a whitelist of trusted domains instead of "*".'
      });
    }
  });

  // Check for credentials with wildcard origin
  const credentialsWithWildcardPattern = /cors\s*\(\s*\{[^}]*credentials\s*:\s*true[^}]*origin\s*:\s*["'`]\*["'`]/gi;
  lines.forEach((line, index) => {
    if (credentialsWithWildcardPattern.test(line)) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'CORS Credentials with Wildcard Origin',
        severity: 'high',
        description: 'CORS credentials enabled with wildcard origin',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Never use credentials: true with origin: "*". Specify exact origins when using credentials.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for missing rate limiting
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkRateLimiting(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check if file has routes but no rate limiting
  const hasRoutes = /router\.(get|post|put|delete|patch)\s*\(/gi.test(content);
  const hasRateLimiting = /rateLimit|rate-limit|express-rate-limit/gi.test(content);

  if (hasRoutes && !hasRateLimiting && filePath.includes('route')) {
    vulnerabilities.push({
      type: 'exposed_route',
      name: 'Missing Rate Limiting',
      severity: 'medium',
      description: 'Routes defined without rate limiting protection',
      file: filePath,
      line: 1,
      code: 'File contains routes without rate limiting',
      recommendation: 'Implement rate limiting using express-rate-limit or similar middleware to prevent abuse.'
    });
  }

  // Check for authentication routes without rate limiting
  const authRoutePattern = /router\.(post|put)\s*\(\s*["'`].*\/(login|register|signup|auth|password)[^"'`]*["'`]/gi;
  lines.forEach((line, index) => {
    if (authRoutePattern.test(line) && !hasRateLimiting) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'Authentication Route Without Rate Limiting',
        severity: 'high',
        description: 'Authentication endpoint without rate limiting',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Add strict rate limiting to authentication endpoints to prevent brute force attacks.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check file upload route security
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkFileUploadRoutes(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for file upload without size limit
  const uploadWithoutLimitPattern = /multer\s*\(\s*\{(?![^}]*limits)/gi;
  lines.forEach((line, index) => {
    if (uploadWithoutLimitPattern.test(line)) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'File Upload Without Size Limit',
        severity: 'medium',
        description: 'File upload configured without size limits',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Set file size limits in multer configuration: limits: { fileSize: 5 * 1024 * 1024 } // 5MB'
      });
    }
  });

  // Check for file upload without type validation
  const uploadWithoutFilterPattern = /multer\s*\(\s*\{(?![^}]*fileFilter)/gi;
  lines.forEach((line, index) => {
    if (uploadWithoutFilterPattern.test(line)) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'File Upload Without Type Validation',
        severity: 'high',
        description: 'File upload without file type validation',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Implement fileFilter to validate file types. Only allow specific, safe file extensions.'
      });
    }
  });

  // Check for direct file path usage
  const directFilePathPattern = /req\.file\.path|req\.files\[.*\]\.path/gi;
  lines.forEach((line, index) => {
    if (directFilePathPattern.test(line) && !line.includes('sanitize')) {
      vulnerabilities.push({
        type: 'exposed_route',
        name: 'Unsafe File Path Usage',
        severity: 'high',
        description: 'Direct use of uploaded file path without sanitization',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Sanitize file paths and names. Use path.basename() and validate against directory traversal.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check API versioning and deprecation
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkAPIVersioning(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for routes without versioning
  const hasVersioning = /\/v\d+\/|\/api\/v\d+\//gi.test(content);
  const hasRoutes = /router\.(get|post|put|delete|patch)\s*\(/gi.test(content);

  if (hasRoutes && !hasVersioning && filePath.includes('route') && !filePath.includes('public')) {
    vulnerabilities.push({
      type: 'exposed_route',
      name: 'API Without Versioning',
      severity: 'low',
      description: 'API routes without version prefix',
      file: filePath,
      line: 1,
      code: 'Routes defined without API versioning',
      recommendation: 'Use API versioning (e.g., /api/v1/) to allow backward compatibility and easier updates.'
    });
  }

  // Check for deprecated endpoints still active
  const deprecatedPattern = /\/\*\s*@deprecated|\/\/\s*@deprecated|\/\/\s*DEPRECATED/gi;
  lines.forEach((line, index) => {
    if (deprecatedPattern.test(line)) {
      const nextLines = lines.slice(index, index + 5).join('\n');
      if (/router\.(get|post|put|delete|patch)/gi.test(nextLines)) {
        vulnerabilities.push({
          type: 'exposed_route',
          name: 'Deprecated Endpoint Still Active',
          severity: 'low',
          description: 'Deprecated endpoint is still accessible',
          file: filePath,
          line: index + 1,
          code: line.trim(),
          recommendation: 'Remove deprecated endpoints or add proper deprecation headers and sunset dates.'
        });
      }
    }
  });

  return vulnerabilities;
}

/**
 * Get security recommendation
 * @param {string} issueType - Type of issue detected
 * @returns {string} Security recommendation
 */
function getRecommendation(issueType) {
  const recommendations = {
    'Debug Route': 'Remove debug/test routes from production code or protect them with authentication and environment checks.',
    'Sensitive Endpoint': 'Protect sensitive endpoints with authentication and authorization. Consider removing if not needed.',
    'DELETE Without Auth': 'Add authentication middleware to DELETE endpoints. Verify user permissions before allowing deletion.'
  };

  return recommendations[issueType] || 'Review route security and add appropriate authentication/authorization middleware.';
}

/**
 * Analyze multiple files for route issues
 * @param {Array} files - Array of file objects with path and content
 * @returns {Object} Analysis results
 */
function analyzeMultipleFiles(files) {
  const allVulnerabilities = [];
  
  try {
    files.forEach(file => {
      try {
        const vulnerabilities = analyzeRoutes(file.content, file.path);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error('=== ROUTE ANALYZER FILE ERROR ===');
        console.error('File:', file.path);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('=================================');
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
    console.error('=== ROUTE ANALYZER MULTIPLE FILES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('===========================================');
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
  analyzeRoutes,
  analyzeMultipleFiles,
  getSummary,
  groupBySeverity,
  groupByType
};

// Made with Bob