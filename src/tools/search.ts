import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";
import { BASE_URL } from "../constants.js";

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "search_reddit",
    {
      title: "Search Reddit",
      description:
        "Search Reddit globally or within a specific subreddit. Returns matching posts.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        subreddit: z
          .string()
          .optional()
          .describe("Limit search to a specific subreddit (without r/ prefix)"),
        sort: z
          .enum(["relevance", "hot", "top", "new", "comments"])
          .default("relevance")
          .describe("Sort order for results"),
        time: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .default("all")
          .describe("Time range filter"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Number of results to return"),
      }),
    },
    async ({ query, subreddit, sort, time, limit }) => {
      try {
        const params = new URLSearchParams({
          q: query,
          sort,
          t: time,
          limit: String(limit),
          type: "link",
        });
        if (subreddit) {
          params.set("restrict_sr", "on");
        }

        const basePath = subreddit
          ? `/r/${subreddit}/search.json`
          : `/search.json`;

        const data = await client.getJson(`${basePath}?${params}`);
        const results = (data?.data?.children || []).map((c: any) => {
          const p = c.data;
          return {
            id: p.name || `t3_${p.id}`,
            title: p.title,
            author: p.author,
            subreddit: p.subreddit,
            score: p.score,
            numComments: p.num_comments,
            url: p.url,
            permalink: `${BASE_URL}${p.permalink}`,
            createdUtc: p.created_utc,
            isSelf: p.is_self,
            flair: p.link_flair_text || null,
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { query, subreddit: subreddit ?? null, sort, time, results },
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
              text: `Error searching Reddit: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
