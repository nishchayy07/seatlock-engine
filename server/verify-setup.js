#!/usr/bin/env node

/**
 * Setup Verification Script for SeatLock Engine
 * Checks if all prerequisites are met before running the application
 */

import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

const checks = {
  passed: [],
  failed: [],
  warnings: []
};

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

async function checkNodeVersion() {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major >= 18) {
      checks.passed.push(`Node.js ${version} ✓`);
      return true;
    } else {
      checks.failed.push(`Node.js version ${version} is too old (need v18+)`);
      return false;
    }
  } catch (error) {
    checks.failed.push('Node.js not found');
    return false;
  }
}

async function checkPostgreSQL() {
  try {
    await execAsync('psql --version');
    checks.passed.push('PostgreSQL installed ✓');
    return true;
  } catch (error) {
    checks.warnings.push('PostgreSQL not found in PATH (install or ensure it\'s running)');
    return false;
  }
}

async function checkRedis() {
  try {
    await execAsync('redis-cli --version');
    checks.passed.push('Redis CLI installed ✓');
    return true;
  } catch (error) {
    checks.warnings.push('Redis not found in PATH (install or ensure it\'s running)');
    return false;
  }
}

async function checkEnvFiles() {
  const serverEnv = fs.existsSync('server/.env');
  const clientEnv = fs.existsSync('client/.env');

  if (serverEnv) {
    checks.passed.push('server/.env exists ✓');
  } else {
    checks.warnings.push('server/.env not found (copy from server/.env.example)');
  }

  if (clientEnv) {
    checks.passed.push('client/.env exists ✓');
  } else {
    checks.warnings.push('client/.env not found (copy from client/.env.example)');
  }

  return serverEnv && clientEnv;
}

async function checkDependencies() {
  const serverDeps = fs.existsSync('server/node_modules');
  const clientDeps = fs.existsSync('client/node_modules');

  if (serverDeps) {
    checks.passed.push('Server dependencies installed ✓');
  } else {
    checks.failed.push('Server dependencies missing (run: npm install)');
  }

  if (clientDeps) {
    checks.passed.push('Client dependencies installed ✓');
  } else {
    checks.failed.push('Client dependencies missing (run: npm install)');
  }

  return serverDeps && clientDeps;
}

async function checkDatabaseSchema() {
  const schemaExists = fs.existsSync('server/src/db/schema.sql');
  if (schemaExists) {
    checks.passed.push('Database schema file exists ✓');
    return true;
  } else {
    checks.failed.push('Database schema file missing');
    return false;
  }
}

async function main() {
  log('\n🔍 SeatLock Engine Setup Verification\n', 'info');
  log('Checking prerequisites...\n', 'info');

  await checkNodeVersion();
  await checkPostgreSQL();
  await checkRedis();
  await checkEnvFiles();
  await checkDependencies();
  await checkDatabaseSchema();

  console.log('\n' + '='.repeat(60) + '\n');

  if (checks.passed.length > 0) {
    log('✅ PASSED:', 'success');
    checks.passed.forEach(msg => log(`   ${msg}`, 'success'));
    console.log();
  }

  if (checks.warnings.length > 0) {
    log('⚠️  WARNINGS:', 'warning');
    checks.warnings.forEach(msg => log(`   ${msg}`, 'warning'));
    console.log();
  }

  if (checks.failed.length > 0) {
    log('❌ FAILED:', 'error');
    checks.failed.forEach(msg => log(`   ${msg}`, 'error'));
    console.log();
  }

  console.log('='.repeat(60) + '\n');

  if (checks.failed.length === 0) {
    if (checks.warnings.length === 0) {
      log('🎉 All checks passed! You\'re ready to start the application.', 'success');
      log('\nNext steps:', 'info');
      log('  1. Create and configure .env files (if not done)', 'info');
      log('  2. Start PostgreSQL and Redis', 'info');
      log('  3. Run: npm run seed', 'info');
      log('  4. Run: npm run dev:server', 'info');
      log('  5. Run: npm run dev:client (in another terminal)\n', 'info');
    } else {
      log('⚠️  Setup is mostly complete, but some warnings need attention.', 'warning');
      log('Review the warnings above before starting.\n', 'warning');
    }
  } else {
    log('❌ Setup incomplete. Please fix the failed checks above.\n', 'error');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n❌ Verification failed: ${error.message}`, 'error');
  process.exit(1);
});
