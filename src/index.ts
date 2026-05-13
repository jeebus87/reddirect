#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RedditClient } from "./reddit/client.js";
import { register as registerAuthTools } from "./tools/auth.js";
import { register as registerBrowseTools } from "./tools/browse.js";
import { register as registerSearchTools } from "./tools/search.js";
import { register as registerPostTools } from "./tools/post.js";
import { register as registerVoteTools } from "./tools/vote.js";
import { register as registerSaveTools } from "./tools/save.js";
import { register as registerInboxTools } from "./tools/inbox.js";
import { register as registerSubscriptionTools } from "./tools/subscriptions.js";
import { register as registerQueueTools } from "./tools/queue.js";
import { QueueManager } from "./queue/manager.js";
import { DEFAULT_SESSION_PATH } from "./constants.js";

const server = new McpServer({
  name: "reddirect",
  version: "1.0.0",
});

const sessionPath =
  process.env.REDDIT_MCP_SESSION_PATH || DEFAULT_SESSION_PATH;

const client = new RedditClient(sessionPath);
const queue = new QueueManager(client);

registerAuthTools(server, client);
registerBrowseTools(server, client);
registerSearchTools(server, client);
registerPostTools(server, client);
registerVoteTools(server, client);
registerSaveTools(server, client);
registerInboxTools(server, client);
registerSubscriptionTools(server, client);
registerQueueTools(server, queue);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[reddirect] Server started on stdio");
}

main().catch((error) => {
  console.error("[reddirect] Fatal error:", error);
  process.exit(1);
});
