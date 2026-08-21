/**
 * Authentication & Authorization Analyzer
 * Detects missing authentication, weak authorization, and related security issues
 */

const { getPatterns } = require('../utils/patterns');
const logger = require('../utils/logger');

/**
 * Analyze file content for authentication/authorization issues
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {Array} Array of detected vulnerabilities
 */
function analyzeAuth(content, filePath) {
  const vulnerabilities = [];
  const authPatterns = getPatterns('authentication');
  const lines = content.split('\n');

  authPatterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    lines.forEach((line, index) => {
      const matches = line.matchAll(regex);
      
      for (const match of matches) {
        // Additional context check for routes
        if (pattern.name === 'Missing Authentication Middleware') {
          if (shouldSkipRoute(line, lines, index)) {
            continue;
          }
        }

        vulnerabilities.push({
          type: 'authentication',
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          file: filePath,
          line: index + 1,
          code: line.trim(),
          context: getContext(lines, index),
          recommendation: getRecommendation(pattern.name)
        });

        logger.debug(`Auth issue detected: ${pattern.name} in ${filePath}:${index + 1}`);
      }
    });
  });

  // Additional checks for specific patterns
  vulnerabilities.push(...checkWeakJWT(content, filePath));
  vulnerabilities.push(...checkSessionSecurity(content, filePath));
  vulnerabilities.push(...checkPasswordHandling(content, filePath));

  return vulnerabilities;
}

/**
 * Check if route should be skipped (e.g., already has auth in next line)
 * @param {string} line - Current line
 * @param {Array} lines - All lines
 * @param {number} index - Current line index
 * @returns {boolean} True if should skip
 */
function shouldSkipRoute(line, lines, index) {
  // Check if next few lines have authentication middleware
  const nextLines = lines.slice(index + 1, index + 4).join(' ');
  if (/auth|authenticate|isAuthenticated|requireAuth/i.test(nextLines)) {
    return true;
  }

  // Check if it's a public route
  if (/\/public|\/static|\/assets|\/health|\/ping/i.test(line)) {
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
 * Check for weak JWT implementations
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkWeakJWT(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for weak JWT secrets
  const weakSecretPattern = /jwt\.sign\([^,]+,\s*["']([^"']{1,15})["']/gi;
  lines.forEach((line, index) => {
    const match = weakSecretPattern.exec(line);
    if (match) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'Weak JWT Secret',
        severity: 'high',
        description: 'JWT secret is too short or hardcoded',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use a strong, randomly generated secret (at least 32 characters) stored in environment variables.'
      });
    }
  });

  // Check for missing JWT expiration
  const noExpirationPattern = /jwt\.sign\([^)]*\)(?![^{]*expiresIn)/gi;
  lines.forEach((line, index) => {
    if (noExpirationPattern.test(line) && line.includes('jwt.sign')) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'JWT Without Expiration',
        severity: 'medium',
        description: 'JWT token created without expiration time',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Always set an expiration time for JWT tokens (e.g., expiresIn: "1h").'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for session security issues
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkSessionSecurity(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for insecure session configuration
  const insecureSessionPattern = /session\s*\(\s*\{[^}]*secure\s*:\s*false/gi;
  lines.forEach((line, index) => {
    if (insecureSessionPattern.test(line)) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'Insecure Session Cookie',
        severity: 'high',
        description: 'Session cookie not marked as secure',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Set secure: true for session cookies in production to ensure they are only sent over HTTPS.'
      });
    }
  });

  // Check for missing httpOnly flag
  const noHttpOnlyPattern = /session\s*\(\s*\{(?![^}]*httpOnly)/gi;
  lines.forEach((line, index) => {
    if (noHttpOnlyPattern.test(line) && line.includes('session')) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'Session Cookie Without httpOnly',
        severity: 'medium',
        description: 'Session cookie not marked as httpOnly',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Set httpOnly: true to prevent client-side JavaScript from accessing the cookie.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for password handling issues
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkPasswordHandling(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for weak password hashing
  const weakHashPattern = /\b(md5|sha1|sha256)\s*\(/gi;
  lines.forEach((line, index) => {
    if (weakHashPattern.test(line) && /password|pwd|pass/i.test(line)) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'Weak Password Hashing',
        severity: 'critical',
        description: 'Using weak hashing algorithm for passwords',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use bcrypt, argon2, or scrypt for password hashing. These are designed for password storage.'
      });
    }
  });

  // Check for password comparison without timing-safe method
  const unsafeComparePattern = /password\s*===?\s*|===?\s*password/gi;
  lines.forEach((line, index) => {
    if (unsafeComparePattern.test(line)) {
      vulnerabilities.push({
        type: 'authentication',
        name: 'Timing Attack Vulnerable Password Comparison',
        severity: 'medium',
        description: 'Password comparison vulnerable to timing attacks',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Use bcrypt.compare() or crypto.timingSafeEqual() for password comparison.'
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
    'Missing Authentication Middleware': 'Add authentication middleware (e.g., passport, JWT verification) before route handlers that require authentication.',
    'Commented Auth Check': 'Remove commented authentication checks or uncomment them if they are needed. Never disable security checks in production.',
    'Admin Route Without Protection': 'Protect admin routes with both authentication and authorization middleware. Verify user roles before allowing access.'
  };

  return recommendations[issueType] || 'Implement proper authentication and authorization checks for all protected routes.';
}

/**
 * Analyze multiple files for auth issues
 * @param {Array} files - Array of file objects with path and content
 * @returns {Object} Analysis results
 */
function analyzeMultipleFiles(files) {
  const allVulnerabilities = [];
  
  try {
    files.forEach(file => {
      try {
        const vulnerabilities = analyzeAuth(file.content, file.path);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error('=== AUTH ANALYZER FILE ERROR ===');
        console.error('File:', file.path);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('================================');
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
    console.error('=== AUTH ANALYZER MULTIPLE FILES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('==========================================');
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
  analyzeAuth,
  analyzeMultipleFiles,
  getSummary,
  groupBySeverity,
  groupByType
};

// Made with Bob