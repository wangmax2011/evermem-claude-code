#!/usr/bin/env node
/**
 * EverMem Dashboard Proxy Server
 *
 * Serves the dashboard and proxies API requests to EverMind,
 * working around the browser limitation of not supporting GET requests with body.
 *
 * Usage: node proxy.js
 * Or: EVERMEM_API_KEY=xxx node proxy.js
 */

import http from 'http';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.EVERMEM_PROXY_PORT || 3456;
// Support both local EverMemOS and cloud API
const API_BASE = process.env.EVERMEM_API_URL || 'http://localhost:1995';
const IS_LOCAL = API_BASE === 'http://localhost:1995';
const GROUPS_FILE = join(__dirname, '..', 'data', 'groups.jsonl');

/**
 * Compute keyId from API key (SHA-256 hash, first 12 chars)
 */
function computeKeyId(apiKey) {
  if (!apiKey) return null;
  const hash = createHash('sha256').update(apiKey).digest('hex');
  return hash.substring(0, 12);
}

/**
 * Read groups from JSONL file and filter by keyId
 */
function getGroupsForKey(keyId) {
  if (!existsSync(GROUPS_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(GROUPS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Aggregate by groupId for matching keyId
    const groupMap = new Map();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Only include entries matching this keyId
        // Local mode: accept null keyId as well
        if (keyId !== 'local' && entry.keyId !== keyId) continue;
        if (keyId === 'local' && entry.keyId !== null && entry.keyId !== 'local') continue;

        const existing = groupMap.get(entry.groupId);
        if (existing) {
          existing.sessionCount += 1;
          if (entry.timestamp > existing.lastSeen) {
            existing.lastSeen = entry.timestamp;
          }
          if (entry.timestamp < existing.firstSeen) {
            existing.firstSeen = entry.timestamp;
          }
        } else {
          groupMap.set(entry.groupId, {
            id: entry.groupId,
            name: entry.name,
            path: entry.path,
            firstSeen: entry.timestamp,
            lastSeen: entry.timestamp,
            sessionCount: 1
          });
        }
      } catch {}
    }

    // Sort by lastSeen (most recent first)
    return Array.from(groupMap.values()).sort((a, b) =>
      new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  } catch {
    return [];
  }
}

function sendCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, data) {
  sendCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    sendCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle POST /api/v0/memories or /api/v1/memories (list) - forwards as GET with body
  if (req.method === 'POST' && (req.url === '/api/v0/memories' || req.url === '/api/v1/memories')) {
    let body = '';

    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
      const authHeader = req.headers['authorization'];
      // Local mode: auth is optional
      if (!IS_LOCAL && !authHeader) {
        sendJson(res, 401, { error: 'Missing Authorization header' });
        return;
      }

      try {
        // Parse and transform body for local mode
        let requestBody = JSON.parse(body);

        // Local mode: convert page/page_size to limit/offset
        if (IS_LOCAL) {
          if (requestBody.page_size !== undefined) {
            requestBody.limit = requestBody.page_size;
            delete requestBody.page_size;
          }
          if (requestBody.page !== undefined) {
            requestBody.offset = (requestBody.page - 1) * (requestBody.limit || 100);
            delete requestBody.page;
          }
        }

        // Forward as GET with body using curl
        const jsonBody = JSON.stringify(requestBody).replace(/'/g, "'\\''");
        const apiVersion = IS_LOCAL ? 'v1' : 'v0';
        const authHeaderStr = authHeader ? `-H "Authorization: ${authHeader}"` : '';
        const curlCmd = `curl -s -X GET "${API_BASE}/api/${apiVersion}/memories" ${authHeaderStr} -H "Content-Type: application/json" -d '${jsonBody}'`;

        const result = execSync(curlCmd, { timeout: 30000, encoding: 'utf8' });
        const data = JSON.parse(result);
        sendJson(res, 200, data);
      } catch (error) {
        console.error('Proxy error:', error.message);
        sendJson(res, 500, {
          error: 'Proxy request failed',
          message: error.message,
          stdout: error.stdout?.toString(),
          stderr: error.stderr?.toString()
        });
      }
    });
    return;
  }

  // Handle POST /api/v0/memories/search or /api/v1/memories/search - forwards as GET with body
  if (req.method === 'POST' && (req.url === '/api/v0/memories/search' || req.url === '/api/v1/memories/search')) {
    let body = '';

    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
      const authHeader = req.headers['authorization'];
      // Local mode: auth is optional
      if (!IS_LOCAL && !authHeader) {
        sendJson(res, 401, { error: 'Missing Authorization header' });
        return;
      }

      try {
        // Forward as GET with body using curl
        const jsonBody = body.replace(/'/g, "'\\''");
        const apiVersion = IS_LOCAL ? 'v1' : 'v0';
        const authHeaderStr = authHeader ? `-H "Authorization: ${authHeader}"` : '';
        const curlCmd = `curl -s -X GET "${API_BASE}/api/${apiVersion}/memories/search" ${authHeaderStr} -H "Content-Type: application/json" -d '${jsonBody}'`;

        const result = execSync(curlCmd, { timeout: 30000, encoding: 'utf8' });
        const data = JSON.parse(result);
        sendJson(res, 200, data);
      } catch (error) {
        console.error('Proxy error:', error.message);
        sendJson(res, 500, {
          error: 'Proxy request failed',
          message: error.message,
          stdout: error.stdout?.toString(),
          stderr: error.stderr?.toString()
        });
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', port: PORT, mode: IS_LOCAL ? 'local' : 'cloud' });
    return;
  }

  // Get groups for the current API key (or all groups in local mode)
  if (req.method === 'GET' && req.url === '/api/groups') {
    const authHeader = req.headers['authorization'];
    // Local mode: auth is optional, use a default keyId
    let keyId;
    if (IS_LOCAL) {
      keyId = 'local';
    } else {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendJson(res, 401, { error: 'Missing or invalid Authorization header' });
        return;
      }
      const apiKey = authHeader.replace('Bearer ', '');
      keyId = computeKeyId(apiKey);
    }

    const groups = getGroupsForKey(keyId);

    sendJson(res, 200, {
      status: 'ok',
      keyId,
      groups,
      totalGroups: groups.length,
      mode: IS_LOCAL ? 'local' : 'cloud'
    });
    return;
  }

  // Serve dashboard HTML
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/dashboard' || req.url.startsWith('/dashboard?'))) {
    try {
      const dashboardPath = join(__dirname, '..', 'assets', 'dashboard.html');
      const html = readFileSync(dashboardPath, 'utf8');
      sendCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to load dashboard', message: error.message });
    }
    return;
  }

  // Serve logo
  if (req.method === 'GET' && req.url === '/logo.png') {
    try {
      const logoPath = join(__dirname, '..', 'assets', 'logo.png');
      const logo = readFileSync(logoPath);
      sendCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(logo);
    } catch (error) {
      sendJson(res, 404, { error: 'Logo not found' });
    }
    return;
  }

  // 404 for everything else
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`EverMem Dashboard Proxy running on http://localhost:${PORT}`);
  console.log(`API Backend: ${API_BASE} (${IS_LOCAL ? 'local' : 'cloud'} mode)`);
  console.log('');
  console.log('The dashboard can now connect to this proxy to fetch memories.');
  console.log('Press Ctrl+C to stop.');
});
