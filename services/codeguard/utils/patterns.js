/**
 * Security vulnerability detection patterns
 * Each pattern includes regex, severity, and description
 */

const patterns = {
  // Hardcoded Secrets Patterns
  secrets: [
    {
      name: 'AWS Access Key',
      regex: /AKIA[0-9A-Z]{16}/g,
      severity: 'critical',
      description: 'AWS Access Key ID detected'
    },
    {
      name: 'AWS Secret Key',
      regex: /aws_secret_access_key\s*=\s*["']([^"']+)["']/gi,
      severity: 'critical',
      description: 'AWS Secret Access Key detected'
    },
    {
      name: 'GitHub Token',
      regex: /ghp_[a-zA-Z0-9]{36}/g,
      severity: 'critical',
      description: 'GitHub Personal Access Token detected'
    },
    {
      name: 'Generic API Key',
      regex: /api[_-]?key\s*[=:]\s*["']([^"']{20,})["']/gi,
      severity: 'high',
      description: 'Potential API key detected'
    },
    {
      name: 'Generic Secret',
      regex: /secret\s*[=:]\s*["']([^"']{8,})["']/gi,
      severity: 'high',
      description: 'Potential secret value detected'
    },
    {
      name: 'Password in Code',
      regex: /password\s*[=:]\s*["']([^"']{4,})["']/gi,
      severity: 'critical',
      description: 'Hardcoded password detected'
    },
    {
      name: 'Private Key',
      regex: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
      severity: 'critical',
      description: 'Private key detected in code'
    },
    {
      name: 'JWT Token',
      regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
      severity: 'high',
      description: 'JWT token detected'
    },
    {
      name: 'Database Connection String',
      regex: /(mongodb|postgres|mysql):\/\/[^:]+:[^@]+@[^\s"']+/gi,
      severity: 'critical',
      description: 'Database connection string with credentials detected'
    },
    {
      name: 'Slack Token',
      regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
      severity: 'high',
      description: 'Slack token detected'
    }
  ],

  // SQL Injection Patterns
  sqlInjection: [
    {
      name: 'String Concatenation in Query',
      regex: /["'`]\s*\+\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\+\s*["'`]|["'`].*\$\{[^}]+\}.*["'`]/g,
      severity: 'high',
      description: 'SQL query using string concatenation - potential SQL injection'
    },
    {
      name: 'Direct Variable in Query',
      regex: /(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*\+\s*[a-zA-Z_$]/gi,
      severity: 'high',
      description: 'SQL query with direct variable concatenation'
    },
    {
      name: 'Unsafe Query Execution',
      regex: /\.query\s*\(\s*["'`][^"'`]*\$\{/g,
      severity: 'high',
      description: 'Database query with template literal interpolation'
    },
    {
      name: 'Raw SQL Execution',
      regex: /\.raw\s*\(\s*["'`][^"'`]*\+/g,
      severity: 'medium',
      description: 'Raw SQL execution with concatenation'
    }
  ],

  // Authentication/Authorization Patterns
  authentication: [
    {
      name: 'Missing Authentication Middleware',
      regex: /router\.(get|post|put|delete|patch)\s*\(\s*["'`]\/(?!login|register|public)[^"'`]*["'`]\s*,\s*(?!auth|authenticate|isAuthenticated)/gi,
      severity: 'high',
      description: 'Route without authentication middleware'
    },
    {
      name: 'Commented Auth Check',
      regex: /\/\/\s*(auth|authenticate|isAuthenticated|requireAuth)/gi,
      severity: 'medium',
      description: 'Authentication check is commented out'
    },
    {
      name: 'Admin Route Without Protection',
      regex: /router\.(get|post|put|delete|patch)\s*\(\s*["'`].*\/admin[^"'`]*["'`]/gi,
      severity: 'critical',
      description: 'Admin route potentially without proper authorization'
    }
  ],

  // Input Validation Patterns
  validation: [
    {
      name: 'Missing Input Validation',
      regex: /req\.(body|query|params)\.[a-zA-Z_$][a-zA-Z0-9_$]*(?!\s*&&\s*|\s*\|\|\s*|\.trim\(|\.validate)/g,
      severity: 'medium',
      description: 'Direct use of user input without validation'
    },
    {
      name: 'Unsafe eval Usage',
      regex: /eval\s*\(/g,
      severity: 'critical',
      description: 'Use of eval() function - potential code injection'
    },
    {
      name: 'Unsafe Function Constructor',
      regex: /new\s+Function\s*\(/g,
      severity: 'high',
      description: 'Use of Function constructor - potential code injection'
    },
    {
      name: 'innerHTML Usage',
      regex: /\.innerHTML\s*=/g,
      severity: 'medium',
      description: 'Use of innerHTML - potential XSS vulnerability'
    },
    {
      name: 'Unsafe File Upload',
      regex: /multer\s*\(\s*\{[^}]*\}\s*\)(?!.*fileFilter)/g,
      severity: 'high',
      description: 'File upload without file type validation'
    }
  ],

  // Exposed Routes Patterns
  exposedRoutes: [
    {
      name: 'Debug Route',
      regex: /router\.(get|post|put|delete|patch)\s*\(\s*["'`].*\/(debug|test|dev)[^"'`]*["'`]/gi,
      severity: 'medium',
      description: 'Debug/test route exposed'
    },
    {
      name: 'Sensitive Endpoint',
      regex: /router\.(get|post|put|delete|patch)\s*\(\s*["'`].*\/(config|env|settings|credentials)[^"'`]*["'`]/gi,
      severity: 'high',
      description: 'Potentially sensitive endpoint exposed'
    },
    {
      name: 'DELETE Without Auth',
      regex: /router\.delete\s*\(\s*["'`][^"'`]*["'`]\s*,\s*(?!auth|authenticate)/gi,
      severity: 'high',
      description: 'DELETE endpoint without authentication'
    }
  ],

  // Additional Security Issues
  miscellaneous: [
    {
      name: 'Disabled CORS',
      regex: /cors\s*\(\s*\{\s*origin\s*:\s*["'`]\*["'`]/g,
      severity: 'medium',
      description: 'CORS configured to allow all origins'
    },
    {
      name: 'Insecure Random',
      regex: /Math\.random\(\)/g,
      severity: 'low',
      description: 'Use of Math.random() for security-sensitive operations'
    },
    {
      name: 'Console Log in Production',
      regex: /console\.(log|debug|info)\(/g,
      severity: 'low',
      description: 'Console logging may expose sensitive information'
    },
    {
      name: 'Hardcoded Port',
      regex: /\.listen\s*\(\s*\d{4,5}\s*[,)]/g,
      severity: 'low',
      description: 'Hardcoded port number'
    }
  ]
};

/**
 * Get all patterns for a specific category
 * @param {string} category - Category name (secrets, sqlInjection, etc.)
 * @returns {Array} Array of pattern objects
 */
function getPatterns(category) {
  return patterns[category] || [];
}

/**
 * Get all patterns across all categories
 * @returns {Object} All patterns organized by category
 */
function getAllPatterns() {
  return patterns;
}

/**
 * Get pattern categories
 * @returns {Array} Array of category names
 */
function getCategories() {
  return Object.keys(patterns);
}

module.exports = {
  patterns,
  getPatterns,
  getAllPatterns,
  getCategories
};

// Made with Bob
