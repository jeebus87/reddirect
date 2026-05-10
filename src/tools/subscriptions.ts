import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "get_subscriptions",
    {
      title: "Get Subscriptions",
      description: "List your subscribed subreddits.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const data = await client.getJson("/subreddits/mine.json?limit=100");
        const subs = (data?.data?.children || []).map((c: any) => ({
          name: c.data.display_name,
          subscribers: c.data.subscribers,
          nsfw: c.data.over18,
          url: `https://reddit.com/r/${c.data.display_name}`,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subscriptions: subs }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting subscriptions: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "subscribe_subreddit",
    {
      title: "Subscribe to Subreddit",
      description: "Subscribe to a subreddit.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
      }),
    },
    async ({ subreddit }) => {
      try {
        await client.post("/api/subscribe", {
          sr_name: subreddit,
          action: "sub",
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, subreddit, subscribed: true }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error subscribing: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "unsubscribe_subreddit",
    {
      title: "Unsubscribe from Subreddit",
      description: "Unsubscribe from a subreddit.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
      }),
    },
    async ({ subreddit }) => {
      try {
        await client.post("/api/subscribe", {
          sr_name: subreddit,
          action: "unsub",
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, subreddit, unsubscribed: true }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
