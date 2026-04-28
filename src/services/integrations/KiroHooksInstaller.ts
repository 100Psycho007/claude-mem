/**
 * KiroHooksInstaller - Kiro IDE integration for claude-mem
 *
 * Installs 3 hook files into .kiro/hooks/ (workspace-level) and a global
 * steering file at ~/.kiro/steering/claude-mem.md.
 *
 * Hook files use Kiro's .kiro.hook JSON format and call:
 *   bun worker-service.cjs hook raw <event>
 * via the existing raw platform adapter — no new adapter needed.
 *
 * Hooks registered:
 *   promptSubmit  → context     (inject past memory at session start)
 *   postToolUse   → observation (capture every tool call)
 *   agentStop     → summarize   (compress session on finish)
 *
 * Usage:
 *   npx claude-mem install --ide kiro
 */

import path from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { logger } from '../../utils/logger.js';
import { findBunPath, findWorkerServicePath } from './CursorHooksInstaller.js';

// ============================================================================
// Constants
// ============================================================================

const KIRO_GLOBAL_DIR = path.join(homedir(), '.kiro');
const KIRO_GLOBAL_STEERING_DIR = path.join(KIRO_GLOBAL_DIR, 'steering');

const HOOK_TIMEOUT_CONTEXT = 15;
const HOOK_TIMEOUT_OBSERVATION = 15;
const HOOK_TIMEOUT_SUMMARIZE = 30;

// ============================================================================
// Hook builders
// ============================================================================

/**
 * Build the shell command string for a hook.
 *
 * NOTE: Do NOT pre-escape backslashes here. JSON.stringify() handles
 * backslash escaping when it serialises the hook object to JSON, so
 * manual escaping would produce double-escaped paths (C:\\\\Users\\\\...)
 * that break hook execution on Windows.
 */
function buildHookCommand(bunPath: string, workerPath: string, event: string, payload: string): string {
  return `echo ${payload} | "${bunPath}" "${workerPath}" hook raw ${event}`;
}

function contextHook(bunPath: string, workerPath: string): object {
  return {
    enabled: true,
    name: 'Claude-Mem Context',
    description: 'Injects past session memory as context at the start of every conversation',
    version: '1',
    when: { type: 'promptSubmit' },
    then: {
      type: 'runCommand',
      command: buildHookCommand(bunPath, workerPath, 'context', '{\"event\":\"session-start\"}'),
      timeout: HOOK_TIMEOUT_CONTEXT,
    },
  };
}

function observationHook(bunPath: string, workerPath: string): object {
  return {
    enabled: true,
    name: 'Claude-Mem Observation',
    description: 'Captures tool use observations into claude-mem persistent memory after every tool call',
    version: '1',
    when: { type: 'postToolUse', toolTypes: ['*'] },
    then: {
      type: 'runCommand',
      command: buildHookCommand(bunPath, workerPath, 'observation', '{\"tool\":\"kiro\",\"input\":\"{}\",\"output\":\"tool completed\"}'),
      timeout: HOOK_TIMEOUT_OBSERVATION,
    },
  };
}

function summarizeHook(bunPath: string, workerPath: string): object {
  return {
    enabled: true,
    name: 'Claude-Mem Summarize',
    description: 'Compresses and summarizes captured observations into persistent memory when agent stops',
    version: '1',
    when: { type: 'agentStop' },
    then: {
      type: 'runCommand',
      command: buildHookCommand(bunPath, workerPath, 'summarize', '{\"event\":\"session-end\"}'),
      timeout: HOOK_TIMEOUT_SUMMARIZE,
    },
  };
}

// ============================================================================
// Steering file
// ============================================================================

const STEERING_CONTENT = `---
inclusion: auto
---

# Claude-Mem Persistent Memory

claude-mem is running and capturing observations from every session.
A worker service stores memories in SQLite + vector DB at ~/.claude-mem/.

## Using past context
- Past session summaries are injected automatically at the start of each conversation
- Search past work: \`npx claude-mem search "<query>"\`
- View all memories: http://localhost:37777
- Worker status: \`npx claude-mem status\`

## Privacy
Wrap sensitive content in \`<private>...</private>\` tags to exclude it from memory capture.
`;

// ============================================================================
// Installer
// ============================================================================

/**
 * Install claude-mem hooks for Kiro IDE.
 * Returns 0 on success, 1 on failure.
 */
export async function installKiroHooks(): Promise<number> {
  // Compute at call time so process.cwd() reflects the actual workspace.
  const kiroHooksDir = path.join(process.cwd(), '.kiro', 'hooks');

  try {
    const bunPath = findBunPath();
    const workerPath = findWorkerServicePath();

    if (!workerPath) {
      console.error('  Could not find worker-service.cjs — run npx claude-mem install first');
      return 1;
    }

    // Write workspace hook files
    mkdirSync(kiroHooksDir, { recursive: true });

    writeFileSync(
      path.join(kiroHooksDir, 'claude-mem-context.kiro.hook'),
      JSON.stringify(contextHook(bunPath, workerPath), null, 2),
    );

    writeFileSync(
      path.join(kiroHooksDir, 'claude-mem-observation.kiro.hook'),
      JSON.stringify(observationHook(bunPath, workerPath), null, 2),
    );

    writeFileSync(
      path.join(kiroHooksDir, 'claude-mem-summarize.kiro.hook'),
      JSON.stringify(summarizeHook(bunPath, workerPath), null, 2),
    );

    // Write global steering file (only if ~/.kiro exists)
    if (existsSync(KIRO_GLOBAL_DIR)) {
      mkdirSync(KIRO_GLOBAL_STEERING_DIR, { recursive: true });
      writeFileSync(path.join(KIRO_GLOBAL_STEERING_DIR, 'claude-mem.md'), STEERING_CONTENT);
    }

    console.log(`\nInstallation complete!`);
    console.log(`  Plugin installed to: ${kiroHooksDir}`);
    console.log(`  Steering file: ${KIRO_GLOBAL_STEERING_DIR}/claude-mem.md`);
    console.log(`\nNext steps:`);
    console.log(`  1. Start claude-mem worker: npx claude-mem start`);
    console.log(`  2. Restart Kiro to load the hooks`);
    console.log(`  3. Memory capture is automatic from then on`);

    logger.info('KIRO', 'Hooks installed', { hooksDir: kiroHooksDir });
    return 0;
  } catch (error: unknown) {
    logger.error('KIRO', 'Hook installation failed', {}, error instanceof Error ? error : new Error(String(error)));
    return 1;
  }
}

/**
 * Uninstall claude-mem hooks for Kiro IDE.
 * Returns 0 on success, 1 on failure.
 */
export async function uninstallKiroHooks(): Promise<number> {
  // Compute at call time so process.cwd() reflects the actual workspace.
  const kiroHooksDir = path.join(process.cwd(), '.kiro', 'hooks');

  try {
    const { rmSync } = await import('fs');
    const hookFiles = [
      path.join(kiroHooksDir, 'claude-mem-context.kiro.hook'),
      path.join(kiroHooksDir, 'claude-mem-observation.kiro.hook'),
      path.join(kiroHooksDir, 'claude-mem-summarize.kiro.hook'),
    ];
    for (const f of hookFiles) {
      if (existsSync(f)) rmSync(f);
    }
    const steeringFile = path.join(KIRO_GLOBAL_STEERING_DIR, 'claude-mem.md');
    if (existsSync(steeringFile)) rmSync(steeringFile);

    console.log('  Kiro hooks uninstalled.');
    logger.info('KIRO', 'Hooks uninstalled');
    return 0;
  } catch (error: unknown) {
    logger.error('KIRO', 'Uninstall failed', {}, error instanceof Error ? error : new Error(String(error)));
    return 1;
  }
}
