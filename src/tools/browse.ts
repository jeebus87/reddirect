import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RedditClient } from "../reddit/client.js";
import { BASE_URL } from "../constants.js";

function formatPost(p: any) {
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
    selfText: p.selftext || undefined,
  };
}

function formatComment(c: any, depth: number = 0): any[] {
  if (!c || c.kind !== "t1") return [];
  const d = c.data;
  const result: any[] = [
    {
      id: d.name || `t1_${d.id}`,
      author: d.author,
      body: d.body,
      score: d.score,
      depth,
      parentId: d.parent_id,
      permalink: `${BASE_URL}${d.permalink}`,
      createdUtc: d.created_utc,
    },
  ];
  if (d.replies && d.replies.data?.children) {
    for (const child of d.replies.data.children) {
      result.push(...formatComment(child, depth + 1));
    }
  }
  return result;
}

export function register(server: McpServer, client: RedditClient): void {
  server.registerTool(
    "browse_subreddit",
    {
      title: "Browse Subreddit",
      description:
        "Browse posts from a subreddit with sort options (hot, new, top, rising, controversial). For top and controversial, you can specify a time range.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
        sort: z
          .enum(["hot", "new", "top", "rising", "controversial"])
          .default("hot")
          .describe("Sort order for posts"),
        time: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .optional()
          .describe("Time range filter (only for top and controversial)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Number of posts to return"),
      }),
    },
    async ({ subreddit, sort, time, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (time && (sort === "top" || sort === "controversial")) {
          params.set("t", time);
        }
        const data = await client.getJson(
          `/r/${subreddit}/${sort}.json?${params}`
        );
        const posts = (data?.data?.children || []).map((c: any) =>
          formatPost(c.data)
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { subreddit, sort, time: time ?? null, posts },
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
              text: `Error browsing r/${subreddit}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_post",
    {
      title: "Get Reddit Post",
      description:
        "Fetch a Reddit post and its comments. Returns comments as a flat array with depth and parent_id fields.",
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            "Full Reddit post URL or permalink path (e.g., /r/sub/comments/id/title/)"
          ),
        comment_limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Maximum number of comments to return"),
      }),
    },
    async ({ url, comment_limit }) => {
      try {
        // Normalize to a path
        let permalink = url;
        if (url.startsWith("http")) {
          const u = new URL(url);
          permalink = u.pathname;
        }
        // Remove trailing slash and add .json
        permalink = permalink.replace(/\/$/, "");

        const data = await client.getJson(
          `${permalink}.json?limit=${comment_limit}`
        );

        const postData = data?.[0]?.data?.children?.[0]?.data;
        const post = postData ? formatPost(postData) : null;

        const commentListing = data?.[1]?.data?.children || [];
        const comments: any[] = [];
        for (const c of commentListing) {
          comments.push(...formatComment(c));
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { post, comments: comments.slice(0, comment_limit) },
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
              text: `Error fetching post: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_subreddit_info",
    {
      title: "Get Subreddit Info",
      description:
        "Get subreddit information including description, rules, subscriber count, and whether it is NSFW.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
      }),
    },
    async ({ subreddit }) => {
      try {
        const [aboutData, rulesData] = await Promise.all([
          client.getJson(`/r/${subreddit}/about.json`),
          client.getJson(`/r/${subreddit}/about/rules.json`).catch(() => null),
        ]);
        const d = aboutData?.data || {};
        const rules = (rulesData?.rules || []).map((r: any) => ({
          name: r.short_name,
          description: r.description,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  name: d.display_name,
                  description: d.public_description || d.description,
                  rules,
                  subscribers: d.subscribers,
                  activeUsers: d.accounts_active,
                  nsfw: d.over18,
                  created: d.created_utc,
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
              text: `Error getting subreddit info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_flairs",
    {
      title: "Get Subreddit Flairs",
      description:
        "Get available post flairs for a subreddit. Returns flair IDs and text needed for creating posts with flairs.",
      inputSchema: z.object({
        subreddit: z.string().describe("Subreddit name without r/ prefix"),
      }),
    },
    async ({ subreddit }) => {
      try {
        const data = await client.getJson(
          `/r/${subreddit}/api/link_flair_v2.json`
        );
        const flairs = (Array.isArray(data) ? data : []).map((f: any) => ({
          id: f.id,
          text: f.text,
          type: f.type,
          text_editable: f.text_editable,
          background_color: f.background_color || null,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subreddit, flairs }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting flairs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_user_profile",
    {
      title: "Get User Profile",
      description:
        "Get a Reddit user's public profile including karma breakdown and account age.",
      inputSchema: z.object({
        username: z.string().describe("Reddit username without u/ prefix"),
      }),
    },
    async ({ username }) => {
      try {
        const data = await client.getJson(`/user/${username}/about.json`);
        const d = data?.data || {};
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  username: d.name,
                  postKarma: d.link_karma,
                  commentKarma: d.comment_karma,
                  totalKarma: (d.link_karma || 0) + (d.comment_karma || 0),
                  cakeDay: new Date(
                    (d.created_utc || 0) * 1000
                  ).toISOString(),
                  isMod: d.is_mod,
                  hasVerifiedEmail: d.has_verified_email,
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
              text: `Error getting user profile: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_user_comments",
    {
      title: "Get User Comments",
      description:
        "Get a Reddit user's recent comments. Returns comment body, score, subreddit, and the post it was made on.",
      inputSchema: z.object({
        username: z.string().describe("Reddit username without u/ prefix"),
        sort: z
          .enum(["new", "hot", "top", "controversial"])
          .default("new")
          .describe("Sort order for comments"),
        time: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .optional()
          .describe("Time range filter (only for top and controversial)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Number of comments to return"),
      }),
    },
    async ({ username, sort, time, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (time && (sort === "top" || sort === "controversial")) {
          params.set("t", time);
        }
        const data = await client.getJson(
          `/user/${username}/comments.json?${params}&sort=${sort}`
        );
        const comments = (data?.data?.children || []).map((c: any) => {
          const d = c.data;
          return {
            id: d.name || `t1_${d.id}`,
            body: d.body,
            score: d.score,
            subreddit: d.subreddit,
            postTitle: d.link_title,
            postUrl: `${BASE_URL}${d.permalink.replace(/[^/]+\/?$/, "")}`,
            permalink: `${BASE_URL}${d.permalink}`,
            parentId: d.parent_id,
            createdUtc: d.created_utc,
          };
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ username, sort, comments }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting user comments: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
