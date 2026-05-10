import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "check_session",
    {
      title: "Check Reddit Session",
      description:
        "Check if connected to a Reddit account. Shows username if authorized, or anonymous if not. Run 'authorize' tool to connect your account for write operations.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await client.ensureToken();
        const username = client.getUsername();
        const authenticated = client.isAuthenticated();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: authenticated ? "authenticated" : "anonymous",
                  username,
                  can_read: true,
                  can_write: authenticated,
                  message: authenticated
                    ? `Connected as u/${username}. Full read/write access.`
                    : "Anonymous mode. Reads work. Run 'authorize' to enable writes.",
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
              text: JSON.stringify({
                status: "error",
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "authorize",
    {
      title: "Authorize Reddit Account",
      description:
        "One-time authorization: opens Reddit in your browser to connect your account. You click 'Allow', and reddirect gets permanent access. No API keys or passwords stored. Only needs to be done once.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const username = await client.authorize();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  username,
                  message: `Connected as u/${username}. You now have full read/write access. This authorization persists — you won't need to do this again.`,
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
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
