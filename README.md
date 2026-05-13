<div align="center">

# reddirect

**Reddit MCP Server - No API Keys Required**

Browse, post, comment, vote, and queue actions with timed delays from any MCP client.
No API keys. Just install and go.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-5A45FF)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## Why reddirect?

Every other Reddit MCP server requires you to register an app, get API keys, and configure OAuth. **reddirect doesn't.** It uses Reddit's public OAuth for reads and a one-time browser login for writes - zero setup friction.

| | Other Reddit MCPs | reddirect |
|---|---|---|
| **API keys** | Required | Not needed |
| **App registration** | Required | Not needed |
| **OAuth setup** | Required | Not needed |
| **Password stored** | In config file | Never stored |
| **Install time** | 10+ minutes | 30 seconds |

---

## Quick Start

### 1. Install

```bash
npm install -g reddirect
```

### 2. Add to your MCP client

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "reddirect": {
      "command": "npx",
      "args": ["-y", "reddirect"]
    }
  }
}
```

### 3. Use it

**Reads work immediately** - browse subreddits, search posts, check profiles.

**For writes**, run the `authorize` tool once. A Chrome window opens, you log into Reddit, and it closes automatically. That's it.

---

## Tools

<details>
<summary><strong>Auth (2 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `check_session` | Check auth status - anonymous or logged in |
| `authorize` | One-time browser login for write access |

</details>

<details>
<summary><strong>Browse & Read (6 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `browse_subreddit` | Browse posts with sort (hot / new / top / rising / controversial) and time filters |
| `get_post` | Fetch a post with flat, depth-annotated comment tree |
| `search_reddit` | Search globally or within a subreddit |
| `get_subreddit_info` | Get description, rules, subscriber count |
| `get_flairs` | Get available post flairs for a subreddit (IDs and text) |
| `get_user_profile` | Get karma breakdown and account age |

</details>

<details>
<summary><strong>Write (5 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `create_post` | Create text or link posts with optional flair (supports flair ID and text) |
| `crosspost` | Share an existing post to a different subreddit |
| `reply` | Reply to a post or comment |
| `edit_content` | Edit your own posts or comments |
| `delete_content` | Delete your own posts or comments |

</details>

<details>
<summary><strong>Engagement (4 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `vote` | Upvote, downvote, or remove vote |
| `save_item` | Save a post or comment |
| `unsave_item` | Remove from saved items |
| `get_saved_items` | List your saved items |

</details>

<details>
<summary><strong>Account (5 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `get_inbox` | View messages, mentions, and replies |
| `mark_inbox_read` | Mark all unread as read |
| `get_subscriptions` | List subscribed subreddits |
| `subscribe_subreddit` | Subscribe to a subreddit |
| `unsubscribe_subreddit` | Unsubscribe from a subreddit |

</details>

<details>
<summary><strong>Queue (3 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `queue_action` | Enqueue any write operation with a randomized delay (default 2-3 min) |
| `queue_status` | Check progress of queued items - pending, processing, completed, or failed |
| `queue_cancel` | Cancel a specific queued item or clear the entire queue |

Space out multiple write operations with natural, randomized timing. Enqueue posts, replies, votes, or any write action - they execute sequentially with configurable delays between each.

</details>

---

## How It Works

```
┌─────────────────────────────────────────────┐
│              MCP Client                      │
│          (Any MCP Client)                    │
└──────────────────┬──────────────────────────┘
                   │ stdio
┌──────────────────▼──────────────────────────┐
│              reddirect                       │
│                                              │
│  Reads ──► Anonymous OAuth ──► reddit API    │
│  Writes ─► User token (JWT) ──► reddit API   │
└─────────────────────────────────────────────┘
```

**Reads** use Reddit's public `installed_client` OAuth grant - no credentials needed.

**Writes** use a `token_v2` JWT extracted from a one-time Chrome login via the DevTools Protocol. No passwords are stored. The token lasts ~24 hours.

---

## Requirements

- **Node.js 18+**
- **Google Chrome** - only needed once for the `authorize` step (not needed for reads)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Writes say "authentication required" | Run the `authorize` tool |
| Chrome window doesn't appear | Make sure Google Chrome is installed |
| "Server error" during login | Reddit rate limit - wait 10 minutes |
| Session expired | Run `authorize` again (~24hr sessions) |
| Want to reset session | Delete `~/.reddirect/session.json` |

---

## License

MIT - [License](./LICENSE)
