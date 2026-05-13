import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";

function extractThingId(url: string): string | null {
  // Extract thing ID from URL like /r/sub/comments/abc123/title/
  const match = url.match(/\/comments\/([a-z0-9]+)/i);
  if (match) return `t3_${match[1]}`;
  // Or from a comment URL /r/sub/comments/postid/title/commentid/
  const commentMatch = url.match(
    /\/comments\/[a-z0-9]+\/[^/]*\/([a-z0-9]+)/i
  );
  if (commentMatch) return `t1_${commentMatch[1]}`;
  return null;
}

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "create_post",
    {
      title: "Create Reddit Post",
      description:
        "Create a new text or link post in a subreddit. Returns the permalink of the created post.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
        title: z.string().describe("Post title"),
        type: z
          .enum(["text", "link"])
          .default("text")
          .describe("Post type: text (self post) or link"),
        body: z
          .string()
          .optional()
          .describe("Post body text (for text posts) or URL (for link posts)"),
        flair_text: z
          .string()
          .optional()
          .describe("Flair text to apply to the post"),
        flair_id: z
          .string()
          .optional()
          .describe("Flair template ID (use get_flairs to find available IDs for a subreddit)"),
      }),
    },
    async ({ subreddit, title, type, body, flair_text, flair_id }) => {
      try {
        const params: Record<string, string> = {
          sr: subreddit,
          title,
          kind: type === "link" ? "link" : "self",
        };
        if (body) {
          params[type === "link" ? "url" : "text"] = body;
        }
        if (flair_id) {
          params.flair_id = flair_id;
        }
        if (flair_text) {
          params.flair_text = flair_text;
        }

        const data = await client.post("/api/submit", params);
        const result = data?.json?.data;
        const errors = data?.json?.errors;

        if (errors && errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: errors.map((e: string[]) => e.join(": ")).join("; "),
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  permalink: result?.url || null,
                  id: result?.name || result?.id || null,
                },
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
              text: `Error creating post: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "reply",
    {
      title: "Reply to Post or Comment",
      description:
        "Reply to a Reddit post or comment. Provide a full URL.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("Full Reddit URL of the post or comment to reply to"),
        body: z.string().describe("Reply text content"),
      }),
    },
    async ({ url, body }) => {
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

        const data = await client.post("/api/comment", {
          thing_id: thingId,
          text: body,
        });

        const errors = data?.json?.errors;
        if (errors && errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: errors.map((e: string[]) => e.join(": ")).join("; "),
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const commentData = data?.json?.data?.things?.[0]?.data;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  id: commentData?.name || null,
                  replied_to: thingId,
                },
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
              text: `Error replying: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "edit_content",
    {
      title: "Edit Post or Comment",
      description:
        "Edit your own Reddit post or comment. Provide the URL of the content to edit.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("Full Reddit URL of your post or comment to edit"),
        new_body: z.string().describe("New text content"),
      }),
    },
    async ({ url, new_body }) => {
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

        const data = await client.post("/api/editusertext", {
          thing_id: thingId,
          text: new_body,
        });

        const errors = data?.json?.errors;
        if (errors && errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: errors.map((e: string[]) => e.join(": ")).join("; "),
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, id: thingId, edited: true },
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
              text: `Error editing: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "delete_content",
    {
      title: "Delete Post or Comment",
      description: "Delete your own Reddit post or comment.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("Full Reddit URL of your post or comment to delete"),
      }),
    },
    async ({ url }) => {
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

        await client.post("/api/del", { id: thingId });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, id: thingId, deleted: true },
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
              text: `Error deleting: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
