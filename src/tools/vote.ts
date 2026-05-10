import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";

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
    "vote",
    {
      title: "Vote on Post or Comment",
      description:
        "Upvote, downvote, or remove your vote on a single Reddit post or comment. One vote per call.",
      inputSchema: z.object({
        url: z.string().describe("Full Reddit URL of the post or comment"),
        direction: z
          .enum(["up", "down", "unvote"])
          .describe("Vote direction: up, down, or unvote to remove"),
      }),
    },
    async ({ url, direction }) => {
      try {
        const thingId = extractThingId(url);
        if (!thingId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Could not extract post/comment ID from URL.",
              },
            ],
            isError: true,
          };
        }

        const dir =
          direction === "up" ? "1" : direction === "down" ? "-1" : "0";
        await client.post("/api/vote", { id: thingId, dir });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, id: thingId, direction },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error voting: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
