// CodeGuard analysis engine config — reads from ShieldIQ's existing .env
// (originally CodeGuard's src/config/config.js; trimmed to what the
// embedded module needs — no standalone server/port/rate-limit settings,
// those are ShieldIQ's job now)
const path = require('path');

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',

  // Directory Configuration
  tempDir: path.resolve(process.env.CODEGUARD_TEMP_DIR || './services/codeguard/temp'),
  logsDir: path.resolve('./logs'),

  // Repository Configuration
  maxRepoSizeMB: parseInt(process.env.CODEGUARD_MAX_REPO_SIZE_MB || '100', 10),
  cloneTimeoutMs: parseInt(process.env.CODEGUARD_CLONE_TIMEOUT_MS || '300000', 10),

  // Analysis Configuration
  analysisTimeoutMs: parseInt(process.env.CODEGUARD_ANALYSIS_TIMEOUT_MS || '300000', 10),
  maxFileSizeKB: parseInt(process.env.CODEGUARD_MAX_FILE_SIZE_KB || '1024', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // GitHub Configuration — a per-company token passed at scan time takes
  // priority over this fallback (see routes/itScan.js). Fine for a single
  // company / hackathon demo; NOT for multi-tenant (see chat notes).
  githubToken: process.env.GITHUB_TOKEN || null,

  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.min.css',
    '**/package-lock.json',
    '**/yarn.lock'
  ],

  analyzeExtensions: [
    '.js', '.ts', '.jsx', '.tsx', '.json',
    '.env', '.env.example', '.config.js', '.yml', '.yaml'
  ]
};

module.exports = config;
