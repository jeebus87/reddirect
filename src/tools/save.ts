import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";
import { BASE_URL } from "../constants.js";

function extractThingId(url: string): string | null {
  const commentMatch = url.match(
    /\/comments\/[a-z0-9]+\/[^/]*\/([a-z0-9]+)/i
  );
  if (commentMatch) return `t1_${commentMatch[1]}`;
  const postMatch = url.match(/\/comments\/([a-z0-9]+)/i);
  if (postMatch) return `t3_${postMatch[1]}`;
  return null;
}

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "save_item",
    {
      title: "Save Post or Comment",
      description: "Save a Reddit post or comment to your saved items list.",
      inputSchema: z.object({
        url: z.string().describe("Full Reddit URL of the post or comment to save"),
      }),
    },
    async ({ url }) => {
      try {
        const thingId = extractThingId(url);
        if (!thingId) {
          return {
            content: [{ type: "text" as const, text: "Could not extract ID from URL." }],
            isError: true,
          };
        }
        await client.post("/api/save", { id: thingId });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, id: thingId, saved: true }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error saving: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "unsave_item",
    {
      title: "Unsave Post or Comment",
      description: "Remove a Reddit post or comment from your saved items list.",
      inputSchema: z.object({
        url: z.string().describe("Full Reddit URL of the post or comment to unsave"),
      }),
    },
    async ({ url }) => {
      try {
        const thingId = extractThingId(url);
        if (!thingId) {
          return {
            content: [{ type: "text" as const, text: "Could not extract ID from URL." }],
            isError: true,
          };
        }
        await client.post("/api/unsave", { id: thingId });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, id: thingId, unsaved: true }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error unsaving: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_saved_items",
    {
      title: "Get Saved Items",
      description: "Get your saved Reddit posts and comments.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25).describe("Number of saved items to return"),
      }),
    },
    async ({ limit }) => {
      try {
        const username = client.getUsername();
        const data = await client.getJson(
          `/user/${username}/saved.json?limit=${limit}`
        );
        const items = (data?.data?.children || []).map((c: any) => {
          const d = c.data;
          return {
            id: d.name,
            type: c.kind === "t1" ? "comment" : "post",
            title: d.title || d.link_title || null,
            author: d.author,
            subreddit: d.subreddit,
            score: d.score,
            permalink: `${BASE_URL}${d.permalink}`,
            body: d.body || d.selftext || null,
          };
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ saved_items: items }, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error getting saved items: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );
}
