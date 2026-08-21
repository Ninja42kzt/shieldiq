/**
 * Input Validation Analyzer
 * Detects missing input validation, XSS vulnerabilities, and unsafe code execution
 */

const { getPatterns } = require('../utils/patterns');
const logger = require('../utils/logger');

/**
 * Analyze file content for input validation issues
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {Array} Array of detected vulnerabilities
 */
function analyzeValidation(content, filePath) {
  const vulnerabilities = [];
  const validationPatterns = getPatterns('validation');
  const lines = content.split('\n');

  validationPatterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    lines.forEach((line, index) => {
      const matches = line.matchAll(regex);
      
      for (const match of matches) {
        // Skip if in comment
        if (isInComment(line, match.index)) {
          continue;
        }

        vulnerabilities.push({
          type: 'validation',
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          file: filePath,
          line: index + 1,
          code: line.trim(),
          context: getContext(lines, index),
          recommendation: getRecommendation(pattern.name)
        });

        logger.debug(`Validation issue detected: ${pattern.name} in ${filePath}:${index + 1}`);
      }
    });
  });

  // Additional validation checks
  vulnerabilities.push(...checkXSSVulnerabilities(content, filePath));
  vulnerabilities.push(...checkCommandInjection(content, filePath));
  vulnerabilities.push(...checkPathTraversal(content, filePath));
  vulnerabilities.push(...checkXMLExternalEntity(content, filePath));
  vulnerabilities.push(...checkRegexDOS(content, filePath));

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
 * Check for XSS vulnerabilities
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkXSSVulnerabilities(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for dangerouslySetInnerHTML in React
  const dangerouslySetPattern = /dangerouslySetInnerHTML\s*=\s*\{\{?\s*__html\s*:/gi;
  lines.forEach((line, index) => {
    if (dangerouslySetPattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'React XSS via dangerouslySetInnerHTML',
        severity: 'high',
        description: 'Use of dangerouslySetInnerHTML without sanitization',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Sanitize HTML content using DOMPurify or similar library before rendering.'
      });
    }
  });

  // Check for document.write
  const documentWritePattern = /document\.write\s*\(/gi;
  lines.forEach((line, index) => {
    if (documentWritePattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Unsafe document.write',
        severity: 'medium',
        description: 'Use of document.write can lead to XSS',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Avoid document.write. Use DOM manipulation methods like createElement and appendChild.'
      });
    }
  });

  // Check for unsanitized template rendering
  const unsafeTemplatePattern = /res\.render\([^,]+,\s*\{[^}]*req\.(body|query|params)/gi;
  lines.forEach((line, index) => {
    if (unsafeTemplatePattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Unsanitized Template Data',
        severity: 'medium',
        description: 'User input passed directly to template without sanitization',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Sanitize user input before passing to templates. Use template engine auto-escaping features.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for command injection vulnerabilities
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkCommandInjection(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for exec with user input
  const execPattern = /exec\s*\(\s*["'`][^"'`]*\$\{|exec\s*\(\s*["'`][^"'`]*\+/gi;
  lines.forEach((line, index) => {
    if (execPattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Command Injection Risk',
        severity: 'critical',
        description: 'Shell command execution with user input',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Never use user input in shell commands. Use execFile with array arguments or validate/sanitize strictly.'
      });
    }
  });

  // Check for spawn with shell option
  const spawnShellPattern = /spawn\s*\([^,]+,\s*[^,]*,\s*\{[^}]*shell\s*:\s*true/gi;
  lines.forEach((line, index) => {
    if (spawnShellPattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Unsafe spawn with shell',
        severity: 'high',
        description: 'spawn() called with shell: true option',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Avoid shell: true option. Use spawn with array arguments for better security.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for path traversal vulnerabilities
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkPathTraversal(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for unsanitized file path operations
  const pathTraversalPattern = /fs\.(readFile|writeFile|unlink|readdir)\s*\([^,]*req\.(body|query|params)|path\.join\([^)]*req\.(body|query|params)/gi;
  lines.forEach((line, index) => {
    if (pathTraversalPattern.test(line) && !line.includes('sanitize') && !line.includes('basename')) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Path Traversal Risk',
        severity: 'high',
        description: 'File system operation with unsanitized user input',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Validate file paths. Use path.basename() and check against whitelist. Never trust user input for file paths.'
      });
    }
  });

  // Check for sendFile with user input
  const sendFilePattern = /res\.sendFile\s*\([^)]*req\.(body|query|params)/gi;
  lines.forEach((line, index) => {
    if (sendFilePattern.test(line)) {
      vulnerabilities.push({
        type: 'validation',
        name: 'Unsafe File Download',
        severity: 'high',
        description: 'File download with user-controlled path',
        file: filePath,
        line: index + 1,
        code: line.trim(),
        recommendation: 'Validate file names against whitelist. Use path.basename() and resolve to absolute path within safe directory.'
      });
    }
  });

  return vulnerabilities;
}

/**
 * Check for XML External Entity (XXE) vulnerabilities
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkXMLExternalEntity(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for XML parsing without disabling external entities
  const xmlParsePattern = /xml2js|xmldom|libxmljs/gi;
  const hasXMLParsing = xmlParsePattern.test(content);
  const hasXXEProtection = /noent\s*:\s*false|loadExternalDTD\s*:\s*false/gi.test(content);

  if (hasXMLParsing && !hasXXEProtection) {
    lines.forEach((line, index) => {
      if (xmlParsePattern.test(line)) {
        vulnerabilities.push({
          type: 'validation',
          name: 'XXE Vulnerability',
          severity: 'high',
          description: 'XML parsing without XXE protection',
          file: filePath,
          line: index + 1,
          code: line.trim(),
          recommendation: 'Disable external entity processing: set noent: false and loadExternalDTD: false in XML parser options.'
        });
      }
    });
  }

  return vulnerabilities;
}

/**
 * Check for Regular Expression Denial of Service (ReDoS)
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Vulnerabilities found
 */
function checkRegexDOS(content, filePath) {
  const vulnerabilities = [];
  const lines = content.split('\n');

  // Check for potentially dangerous regex patterns
  const dangerousRegexPatterns = [
    /new\s+RegExp\s*\([^)]*req\.(body|query|params)/gi,  // User-controlled regex
    /\(\.\*\)\+|\(\.\+\)\*/g,  // Nested quantifiers
    /\([^)]*\)\+[^?]/g  // Repeated groups without non-greedy
  ];

  dangerousRegexPatterns.forEach(pattern => {
    lines.forEach((line, index) => {
      if (pattern.test(line) && /regex|RegExp|match|test|search/i.test(line)) {
        vulnerabilities.push({
          type: 'validation',
          name: 'ReDoS Risk',
          severity: 'medium',
          description: 'Regular expression vulnerable to ReDoS attack',
          file: filePath,
          line: index + 1,
          code: line.trim(),
          recommendation: 'Avoid complex regex patterns. Never use user input to construct regex. Use simple string operations when possible.'
        });
      }
    });
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
    'Missing Input Validation': 'Validate all user input using a validation library like Joi, express-validator, or Yup.',
    'Unsafe eval Usage': 'Never use eval(). Use JSON.parse() for JSON data or safer alternatives for dynamic code execution.',
    'Unsafe Function Constructor': 'Avoid Function constructor. Use safer alternatives or refactor code to eliminate dynamic code execution.',
    'innerHTML Usage': 'Use textContent or createElement instead of innerHTML. If HTML is needed, sanitize with DOMPurify.',
    'Unsafe File Upload': 'Implement file type validation using fileFilter. Check MIME types and file extensions against whitelist.'
  };

  return recommendations[issueType] || 'Implement proper input validation and sanitization for all user-provided data.';
}

/**
 * Analyze multiple files for validation issues
 * @param {Array} files - Array of file objects with path and content
 * @returns {Object} Analysis results
 */
function analyzeMultipleFiles(files) {
  const allVulnerabilities = [];
  
  try {
    files.forEach(file => {
      try {
        const vulnerabilities = analyzeValidation(file.content, file.path);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error('=== VALIDATION ANALYZER FILE ERROR ===');
        console.error('File:', file.path);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('======================================');
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
    console.error('=== VALIDATION ANALYZER MULTIPLE FILES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('================================================');
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
  analyzeValidation,
  analyzeMultipleFiles,
  getSummary,
  groupBySeverity,
  groupByType
};

// Made with Bob