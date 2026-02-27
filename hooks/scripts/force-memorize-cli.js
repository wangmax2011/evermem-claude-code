#!/usr/bin/env node

/**
 * Force Memorize CLI - For slash command integration
 *
 * Usage: node force-memorize-cli.js [content]
 * If no content provided, saves the last conversation turn from transcript
 */

import { existsSync, readFileSync } from 'fs';
import { isConfigured, getConfig } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';
import { debug, setDebugPrefix } from './utils/debug.js';

setDebugPrefix('force-memorize-cli');

/**
 * Find the most recent transcript file
 */
function findLatestTranscript(cwd) {
  // Try to find transcript based on session or latest in project
  const projectName = cwd.split('/').filter(Boolean).pop() || 'default';

  // Common patterns for Claude Code transcripts
  const possiblePaths = [
    `${process.env.CLAUDE_HOME || process.env.HOME}/.claude/projects/${projectName}/*.jsonl`,
    `${process.env.CLAUDE_HOME || process.env.HOME}/.claude/transcripts/*.jsonl`,
  ];

  // For now, use environment variable or find from groups
  const groupsFile = `${process.env.CLAUDE_PLUGIN_ROOT || '.'}/data/groups.jsonl`;
  if (existsSync(groupsFile)) {
    try {
      const lines = readFileSync(groupsFile, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        const lastGroup = JSON.parse(lines[lines.length - 1]);
        const transcriptDir = lastGroup.path ? `${process.env.HOME}/.claude/projects/${lastGroup.name}` : null;
        if (transcriptDir && existsSync(transcriptDir)) {
          // Find most recent jsonl file
          // This is simplified - in practice you'd need fs.readdir
          return null;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Extract last turn from transcript
 */
async function extractLastTurn(transcriptPath) {
  if (!existsSync(transcriptPath)) {
    return null;
  }

  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);

  let lastUser = null;
  let lastAssistant = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'system') continue;

      if (entry.type === 'user' && !lastUser) {
        lastUser = entry.message?.content;
      }
      if (entry.type === 'assistant' && !lastAssistant) {
        const content = entry.message?.content;
        lastAssistant = typeof content === 'string' ? content : null;
      }

      if (lastUser && lastAssistant) break;
    } catch {}
  }

  return { user: lastUser, assistant: lastAssistant };
}

async function main() {
  try {
    // Get content from command line args or use default
    const content = process.argv.slice(2).join(' ');

    if (!isConfigured()) {
      console.log('⚠️  EverMem is not configured. Set EVERMEM_API_URL environment variable.');
      process.exit(1);
    }

    const config = getConfig();
    let savedCount = 0;

    if (content) {
      // Save explicit content
      const result = await addMemory({
        content: content,
        role: 'user',
        messageId: `force_cli_${Date.now()}`,
      });

      if (result.ok) {
        console.log(`💾 Saved: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
        savedCount++;
      } else {
        console.log('❌ Failed to save memory');
        debug('Error:', result);
      }
    } else {
      // Try to save from current session context
      // This would need the transcript path from environment
      console.log('💡 Usage: /remember [content]');
      console.log('   Or say: "帮我记一下 [内容]" in your message');
      console.log('');
      console.log('This will force save the current conversation to EverMemOS.');
    }

    process.exit(savedCount > 0 ? 0 : 1);
  } catch (error) {
    console.error('Error:', error.message);
    debug('Error:', error);
    process.exit(1);
  }
}

main();
