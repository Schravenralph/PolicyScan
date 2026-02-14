#!/usr/bin/env node
/**
 * Clean package.json for production fork
 * Removes test-related scripts and dependencies
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(process.cwd(), 'package.json');

if (!fs.existsSync(packagePath)) {
  console.error('❌ package.json not found');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

console.log('🧹 Cleaning package.json...');

// Track what we're removing
const removedScripts = [];
const removedDeps = [];

// Remove test-related scripts
const originalScriptCount = Object.keys(pkg.scripts || {}).length;
const testScriptPatterns = [
  /^test/,
  /test:/,
  /coverage/,
  /lint:test/,
  /playwright/,
  /stryker/,
  /mutation/,
  /e2e/,
  /:test/,
  /test:/,
];

Object.keys(pkg.scripts || {}).forEach(script => {
  const shouldRemove = testScriptPatterns.some(pattern => pattern.test(script));
  if (shouldRemove) {
    removedScripts.push(script);
    delete pkg.scripts[script];
  }
});

// Remove test-related devDependencies
const testDepPatterns = [
  '@playwright',
  '@stryker',
  '@testing-library',
  '@types/jest',
  '@types/supertest',
  'vitest',
  'playwright',
  'stryker',
  'supertest',
  'mongodb-memory-server',
  'nock',
  'ioredis',
  'wait-on',
  'markdown-link-check',
  'markdownlint-cli2',
  'cspell',
  'nx',
  'concurrently',
];

if (pkg.devDependencies) {
  Object.keys(pkg.devDependencies).forEach(dep => {
    const shouldRemove = testDepPatterns.some(pattern => 
      dep.includes(pattern) || dep === pattern
    );
    if (shouldRemove) {
      removedDeps.push(dep);
      delete pkg.devDependencies[dep];
    }
  });
}

// Write cleaned package.json
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✅ Removed ${removedScripts.length} test scripts (${originalScriptCount} → ${Object.keys(pkg.scripts || {}).length})`);
console.log(`✅ Removed ${removedDeps.length} test dependencies`);

if (removedScripts.length > 0) {
  console.log('\n📋 Removed scripts:');
  removedScripts.slice(0, 10).forEach(script => console.log(`   - ${script}`));
  if (removedScripts.length > 10) {
    console.log(`   ... and ${removedScripts.length - 10} more`);
  }
}

if (removedDeps.length > 0) {
  console.log('\n📦 Removed dependencies:');
  removedDeps.slice(0, 10).forEach(dep => console.log(`   - ${dep}`));
  if (removedDeps.length > 10) {
    console.log(`   ... and ${removedDeps.length - 10} more`);
  }
}

console.log('\n✅ package.json cleaned successfully!');

