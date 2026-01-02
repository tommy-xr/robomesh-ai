#!/usr/bin/env npx tsx
/**
 * CLI test suite - tests CLI-specific functionality
 * Usage: pnpm run -F @robomesh/cli test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../index.ts');
const projectRoot = path.resolve(__dirname, '../../..');

// Helper to run CLI and capture output
function runCli(
  args: string[],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', cliPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, INIT_CWD: projectRoot },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Chat Command', () => {
  test('chat command with piped input executes workflow', async () => {
    const result = await runCli(['chat', 'hello-world'], 'test input');
    assert.strictEqual(result.exitCode, 0, `Should exit successfully, got: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Hello') || result.stdout.includes('Workflow completed'),
      `Should show workflow output, got: ${result.stdout}`
    );
  });

  test('chat command with invalid workflow shows error', async () => {
    const result = await runCli(['chat', 'nonexistent-workflow-xyz']);
    assert.notStrictEqual(result.exitCode, 0, 'Should fail');
    assert.ok(
      result.stdout.includes('not found') || result.stderr.includes('not found'),
      `Should show error, got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
  });

  test('chat command resolves shorthand workflow names', async () => {
    // hello-world.yaml exists in workflows/
    const result = await runCli(['chat', 'hello-world'], 'test');
    assert.strictEqual(result.exitCode, 0, `Should resolve hello-world, got: ${result.stderr}`);
  });

  test('chat command shows usage when no workflow specified', async () => {
    const result = await runCli(['chat']);
    assert.notStrictEqual(result.exitCode, 0, 'Should fail without workflow');
    assert.ok(
      result.stdout.includes('specify') || result.stderr.includes('specify'),
      'Should show usage hint'
    );
  });
});

describe('Workflow Resolution', () => {
  test('resolves workflows/name.yaml', async () => {
    const result = await runCli(['chat', 'hello-world'], 'test');
    assert.strictEqual(result.exitCode, 0);
  });

  test('resolves explicit path', async () => {
    const result = await runCli(['chat', './workflows/hello-world.yaml'], 'test');
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('Parallel Execution Display', () => {
  test('shows compact view for parallel nodes', async () => {
    const result = await runCli(['chat', 'test-progressive-slow-parallel'], 'go');
    // The workflow has a merge node that fails due to multiple inputs
    // But we should see the parallel nodes running
    assert.ok(
      result.stdout.includes('Running') || result.stdout.includes('Fast') || result.stdout.includes('Slow'),
      `Should show parallel execution, got: ${result.stdout}`
    );
  });
});

describe('Error Handling', () => {
  test('shows error for failed workflow', async () => {
    const result = await runCli(['chat', 'test-failure-stops-workflow'], 'test');
    assert.notStrictEqual(result.exitCode, 0, 'Should fail');
    assert.ok(
      result.stdout.includes('failed') || result.stdout.includes('✗'),
      `Should show failure, got: ${result.stdout}`
    );
  });
});
