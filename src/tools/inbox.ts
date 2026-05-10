import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";
import { BASE_URL } from "../constants.js";

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "get_inbox",
    {
      title: "Get Inbox",
      description:
        "Get your Reddit inbox messages including unread, mentions, and comment replies.",
      inputSchema: z.object({
        filter: z
          .enum(["all", "unread", "messages", "comment_replies", "post_replies", "mentions"])
          .default("all")
          .describe("Filter inbox by message type"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Number of messages to return"),
      }),
    },
    async ({ filter, limit }) => {
      try {
        const pathMap: Record<string, string> = {
          all: "/message/inbox",
          unread: "/message/unread",
          messages: "/message/messages",
          comment_replies: "/message/comments",
          post_replies: "/message/selfreply",
          mentions: "/message/mentions",
        };

        const data = await client.getJson(
          `${pathMap[filter]}.json?limit=${limit}`
        );
        const messages = (data?.data?.children || []).map((c: any) => {
          const d = c.data;
          return {
            id: d.name,
            type: d.was_comment ? "comment" : "message",
            subject: d.subject,
            author: d.author,
            body: d.body,
            is_unread: d.new,
            context_permalink: d.context
              ? `${BASE_URL}${d.context}`
              : null,
            createdUtc: d.created_utc,
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ filter, messages }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting inbox: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "mark_inbox_read",
    {
      title: "Mark Inbox Read",
      description: "Mark all unread inbox messages as read.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await client.post("/api/read_all_messages", {});
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, marked_all_read: true }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error marking inbox read: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
