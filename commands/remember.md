---
description: Force save the current conversation as a memory
---

Force save the current conversation as a memory.

## Usage

```
/remember
```

This will immediately save the last conversation turn to EverMemOS, bypassing the normal boundary detection.

## How it works

1. Reads the current session transcript
2. Extracts the last user message and assistant response
3. Immediately saves them as an episodic memory using the `/immediate` API
4. Returns confirmation

## When to use

- When you want to explicitly save important information
- When the automatic boundary detection hasn't triggered yet
- To ensure a specific conversation is remembered

## Alternative: Keywords

You can also use keywords in your message to trigger force remember:
- "帮我记一下..."
- "remember this..."
- "save this..."
