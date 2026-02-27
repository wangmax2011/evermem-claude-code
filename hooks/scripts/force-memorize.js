#!/usr/bin/env node

/**
 * Force Memorize - Immediate memory storage
 *
 * This script allows users to explicitly save memories without waiting
 * for automatic boundary detection. It can be triggered by:
 * 1. /remember slash command
 * 2. Keywords like "帮我记一下", "记住这个", "force remember"
 *
 * Usage:
 *   echo '{"content":"要记忆的内容","role":"user"}' | node force-memorize.js
 *   or
 *   echo '{"transcript_path":"/path/to/transcript.jsonl","cwd":"/project"}' | node force-memorize.js
 */

import { readFileSync, existsSync } from 'fs';
import { isConfigured, getConfig } from './utils/config.js';
import { addMemory, forceAddMemory } from './utils/evermem-api.js';
import { debug, setDebugPrefix } from './utils/debug.js';

// Set debug prefix for this script
setDebugPrefix('force-memorize');

/**
 * Force memory keywords in multiple languages
 */
const FORCE_MEMORIZE_KEYWORDS = [
  // Chinese
  '帮我记一下',
  '帮我记住',
  '记住这个',
  '强制记忆',
  '记一下',
  '记录一下',
  // English
  'force remember',
  'remember this',
  'save this',
  'note this down',
  'write this down',
];

/**
 * Check if prompt contains force memorize keywords
 * @param {string} prompt
 * @returns {boolean}
 */
export function containsForceMemorizeKeyword(prompt) {
  if (!prompt) return false;
  const lowerPrompt = prompt.toLowerCase().trim();
  return FORCE_MEMORIZE_KEYWORDS.some(keyword =>
    lowerPrompt.includes(keyword.toLowerCase())
  );
}

/**
 * Extract content after keyword
 * @param {string} prompt
 * @returns {string|null}
 */
export function extractMemorizeContent(prompt) {
  if (!prompt) return null;

  for (const keyword of FORCE_MEMORIZE_KEYWORDS) {
    const index = prompt.toLowerCase().indexOf(keyword.toLowerCase());
    if (index !== -1) {
      // Extract content after the keyword
      const afterKeyword = prompt.slice(index + keyword.length).trim();
      // Remove common leading punctuation
      return afterKeyword.replace(/^[：:，,]+/, '').trim() || null;
    }
  }
  return null;
}

/**
 * Read transcript and extract last turn
 */
async function extractLastTurnFromTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) {
    return null;
  }

  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);

  if (lines.length === 0) return null;

  // Find the last complete turn (marked by turn_duration)
  let lastUserMsg = null;
  let lastAssistantMsg = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      // Skip meta entries
      if (entry.type === 'system' || entry.type === 'file-history-snapshot') continue;

      if (entry.type === 'user' && !lastUserMsg) {
        const content = entry.message?.content;
        if (typeof content === 'string') {
          lastUserMsg = {
            content: content,
            timestamp: entry.timestamp,
          };
        }
      }

      if (entry.type === 'assistant' && !lastAssistantMsg) {
        const content = entry.message?.content;
        if (typeof content === 'string') {
          lastAssistantMsg = {
            content: content,
            timestamp: entry.timestamp,
          };
        } else if (Array.isArray(content)) {
          // Extract text blocks from assistant response
          const textParts = content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          if (textParts) {
            lastAssistantMsg = {
              content: textParts,
              timestamp: entry.timestamp,
            };
          }
        }
      }

      // Stop if we found both
      if (lastUserMsg && lastAssistantMsg) break;
    } catch {}
  }

  return {
    user: lastUserMsg,
    assistant: lastAssistantMsg,
  };
}

/**
 * Force save a memory immediately (with immediate extraction)
 */
async function forceMemorize(content, role = 'user', options = {}) {
  const result = await forceAddMemory({
    content: content,
    role: role,
    messageId: `force_${Date.now()}`,
  });

  debug('Force memorize result:', result);
  return result;
}

/**
 * Main function
 */
async function main() {
  try {
    // Read stdin
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    const hookInput = JSON.parse(input);
    debug('forceMemorizeInput:', hookInput);

    // Set cwd from hook input
    if (hookInput.cwd) {
      process.env.EVERMEM_CWD = hookInput.cwd;
    }

    // Skip if not configured
    if (!isConfigured()) {
      console.log(JSON.stringify({
        systemMessage: '⚠️ EverMem is not configured. Please set EVERMEM_API_URL.',
      }));
      process.exit(0);
    }

    const config = getConfig();
    let savedCount = 0;
    const results = [];

    // Case 1: Direct content provided
    if (hookInput.content) {
      const result = await forceMemorize(
        hookInput.content,
        hookInput.role || 'user'
      );
      if (result.ok) savedCount++;
      results.push(result);
    }
    // Case 2: Extract from transcript
    else if (hookInput.transcript_path) {
      const turn = await extractLastTurnFromTranscript(hookInput.transcript_path);

      if (!turn || (!turn.user && !turn.assistant)) {
        console.log(JSON.stringify({
          systemMessage: '⚠️ No conversation found to remember.',
        }));
        process.exit(0);
      }

      // Save user message
      if (turn.user?.content) {
        const result = await forceMemorize(turn.user.content, 'user');
        if (result.ok) savedCount++;
        results.push({ type: 'user', ...result });
      }

      // Save assistant response
      if (turn.assistant?.content) {
        const result = await forceMemorize(turn.assistant.content, 'assistant');
        if (result.ok) savedCount++;
        results.push({ type: 'assistant', ...result });
      }
    }
    // Case 3: Just use the prompt content directly
    else if (hookInput.prompt) {
      // Remove the keyword from content
      const content = extractMemorizeContent(hookInput.prompt) || hookInput.prompt;
      const result = await forceMemorize(content, 'user');
      if (result.ok) savedCount++;
      results.push(result);
    }

    // Output result for Claude Code
    if (savedCount > 0) {
      console.log(JSON.stringify({
        systemMessage: `💾 Force saved ${savedCount} memory(s) to EverMemOS.`,
        additionalContext: `The user has explicitly requested to remember the previous conversation. This memory was force-saved and should be treated as important.`,
      }));
    } else {
      console.log(JSON.stringify({
        systemMessage: '⚠️ Failed to save memory. Check EverMemOS connection.',
      }));
    }

    debug('Results:', results);
  } catch (error) {
    debug('Error:', error.message);
    console.log(JSON.stringify({
      systemMessage: `❌ Error: ${error.message}`,
    }));
    process.exit(0);
  }
}

// Run if called directly
if (process.argv[1] === import.meta.url.slice(7)) {
  main();
}

export { forceMemorize };
