#!/usr/bin/env node

/**
 * Development launcher - runs all services concurrently
 * Works cross-platform (Windows, Mac, Linux)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const services = [
  { name: 'AGENT', color: colors.cyan, script: 'dev:agent' },
  { name: 'BACKEND', color: colors.green, script: 'dev:backend' },
  { name: 'DESKTOP', color: colors.magenta, script: 'dev:desktop' }
];

console.log(`${colors.bold}Starting all services...${colors.reset}\n`);

const processes = services.map(service => {
  const proc = spawn('npm', ['run', service.script], {
    cwd: __dirname,
    shell: true,
    stdio: 'pipe'
  });

  const prefix = `${service.color}[${service.name}]${colors.reset}`;

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${prefix} ${line}`));
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${prefix} ${line}`));
  });

  proc.on('error', (error) => {
    console.error(`${prefix} Error: ${error.message}`);
  });

  proc.on('close', (code) => {
    console.log(`${prefix} Exited with code ${code}`);
  });

  return proc;
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nShutting down all services...');
  processes.forEach(proc => {
    proc.kill('SIGTERM');
  });
  setTimeout(() => {
    processes.forEach(proc => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    });
    process.exit(0);
  }, 2000);
});

// Handle process termination
process.on('SIGTERM', () => {
  processes.forEach(proc => proc.kill('SIGTERM'));
  process.exit(0);
});
