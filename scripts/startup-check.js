#!/usr/bin/env node

/**
 * Startup check script for Beleidsscan application
 * Verifies environment setup before starting services
 */

// Normalize color environment variables FIRST - before any other imports
// This prevents Node.js warnings about conflicting NO_COLOR and FORCE_COLOR vars
if (process.env.NO_COLOR && process.env.FORCE_COLOR) {
  delete process.env.NO_COLOR; // FORCE_COLOR takes precedence
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function checkFileExists(filePath, name) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    console.log(`${colors.green}✓${colors.reset} ${name} exists`);
  } else {
    console.log(`${colors.red}✗${colors.reset} ${name} is missing`);
  }
  return exists;
}

function checkEnvFile(envPath, examplePath, name) {
  const exists = fs.existsSync(envPath);

  if (exists) {
    console.log(`${colors.green}✓${colors.reset} ${name} exists`);

    // Check if it contains placeholder values
    const content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('<db_password>') || content.includes('YOUR_PASSWORD')) {
      console.log(`${colors.yellow}  ⚠ ${name} contains placeholder values - please update with real credentials${colors.reset}`);
      return false;
    }

    // Check Neo4j password security
    const neo4jPasswordMatch = content.match(/^NEO4J_PASSWORD=(.+)$/m);
    if (neo4jPasswordMatch) {
      const password = neo4jPasswordMatch[1].trim();
      if (password === 'password' || password.length < 16) {
        console.log(`${colors.yellow}  ⚠ Neo4j password is not secure (default or too short)${colors.reset}`);
        console.log(`${colors.yellow}     Run: pnpm run setup:neo4j-password to generate a secure password${colors.reset}`);
      } else {
        console.log(`${colors.green}  ✓ Neo4j password is secure${colors.reset}`);
      }
    }

    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${name} is missing`);
    if (fs.existsSync(examplePath)) {
      console.log(`${colors.yellow}  → Copy ${examplePath} to ${envPath} and update with your credentials${colors.reset}`);
    }
    return false;
  }
}

function checkNodeModules(dirPath, name) {
  const nmPath = path.join(dirPath, 'node_modules');
  const exists = fs.existsSync(nmPath);

  if (exists) {
    console.log(`${colors.green}✓${colors.reset} ${name} dependencies installed`);
  } else {
    console.log(`${colors.red}✗${colors.reset} ${name} dependencies not installed`);
    console.log(`${colors.yellow}  → Run: pnpm install${colors.reset}`);
  }
  return exists;
}

async function runStartupCheck() {
  console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}    Beleidsscan Startup Check${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}\n`);

  const rootDir = path.resolve(path.dirname(__dirname));

  console.log(`${colors.blue}Checking configuration files...${colors.reset}`);
  const envCheck = checkEnvFile(
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.example'),
    '.env file'
  );

  console.log(`\n${colors.blue}Checking dependencies...${colors.reset}`);
  const depsCheck = checkNodeModules(rootDir, 'Project');

  console.log(`\n${colors.blue}Checking source files...${colors.reset}`);
  const serverExists = checkFileExists(
    path.join(rootDir, 'src', 'server', 'index.ts'),
    'Backend source files'
  );
  const clientExists = checkFileExists(
    path.join(rootDir, 'src', 'client', 'main.tsx'),
    'Frontend source files'
  );

  console.log(`\n${colors.blue}═══════════════════════════════════════════════${colors.reset}`);

  const allChecks = envCheck && depsCheck && serverExists && clientExists;

  if (allChecks) {
    console.log(`${colors.green}✓ All checks passed! Ready to start.${colors.reset}\n`);
    console.log(`${colors.blue}To start the application:${colors.reset}`);
    console.log(`  pnpm run dev:all\n`);
    console.log(`${colors.blue}Or start services separately:${colors.reset}`);
    console.log(`  Terminal 1: pnpm run dev:backend`);
    console.log(`  Terminal 2: pnpm run dev:frontend\n`);
    process.exit(0);
  } else {
    console.log(`${colors.yellow}⚠ Some checks failed. Please fix the issues above.${colors.reset}\n`);

    if (!depsCheck) {
      console.log(`${colors.blue}To install dependencies:${colors.reset}`);
      console.log(`  pnpm install`);
      console.log('');
    }

    if (!envCheck) {
      console.log(`${colors.blue}To set up environment files:${colors.reset}`);
      console.log(`  cp .env.example .env`);
      console.log(`  ${colors.yellow}Then edit the .env file with your credentials${colors.reset}\n`);
    }

    console.log(`${colors.blue}For detailed setup instructions, see SETUP.md${colors.reset}\n`);
    process.exit(1);
  }
}

runStartupCheck().catch((error) => {
  console.error(`${colors.red}Startup check failed:${colors.reset}`, error);
  process.exit(1);
});
