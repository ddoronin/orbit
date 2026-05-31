---
description: "Set up OrbitStack context for this workspace before coding"
name: "OrbitStack Agent Setup"
agent: "agent"
---

Follow [the OrbitStack setup instructions](../../agent-setup/prompt.md) for this workspace before writing code.

Complete the setup yourself:

- open the linked local files or raw GitHub docs
- load local OrbitStack agent assets when supported
- use Node.js 23.x for installs, builds, tests, and dev servers
- do not invent OrbitStack MCP servers
- validate actor wiring with `orbitstack build --strict-wiring`

When setup is complete, report:

- which docs you loaded
- which local skills, rules, or prompts you enabled
- anything this agent could not configure automatically
