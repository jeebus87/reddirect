import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SESSION_PATH } from "../constants.js";
import { runOneTimeAuth } from "./auth-flow.js";

const REDDIT_APP_CLIENT_ID = "ohXpoqrZYub1kg"; // Public installed-app client
const OAUTH_BASE = "https://oauth.reddit.com";

interface SessionData {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  username: string | null;
  scope: string;
}

export class RedditClient {
  private session: SessionData | null = null;
  private readonly sessionPath: string;
  private readonly userAgent = "reddirect:v1.0.0 (MCP server)";
  private lastPostTime = 0;
  private static readonly POST_DELAY_MS = 1500;
  private static readonly MAX_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY_MS = 5000;

  constructor(sessionPath?: string) {
    this.sessionPath = sessionPath || DEFAULT_SESSION_PATH;
  }

  async ensureToken(): Promise<void> {
    if (!this.session) {
      await this.loadSession();
    }

    if (this.session && this.session.expiresAt > Date.now()) {
      return; // Token still valid
    }

    if (this.session?.refreshToken) {
      await this.refreshAccessToken();
      return;
    }

    // Get anonymous token (read-only)
    await this.getAnonymousToken();
  }

  private async getAnonymousToken(): Promise<void> {
    console.error("[reddirect] Getting anonymous access token...");

    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.userAgent,
        Authorization:
          "Basic " +
          Buffer.from(REDDIT_APP_CLIENT_ID + ":").toString("base64"),
      },
      body: new URLSearchParams({
        grant_type:
          "https://oauth.reddit.com/grants/installed_client",
        device_id: this.getDeviceId(),
      }),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`OAuth error: ${data.error}`);
    }

    this.session = {
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt: Date.now() + data.expires_in * 1000 - 60000,
      username: null,
      scope: data.scope || "*",
    };

    console.error("[reddirect] Anonymous token acquired (read-only)");
    await this.saveSession();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.session?.refreshToken) return;

    console.error("[reddirect] Refreshing access token...");

    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.userAgent,
        Authorization:
          "Basic " +
          Buffer.from(REDDIT_APP_CLIENT_ID + ":").toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.session.refreshToken,
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("[reddirect] Refresh failed, getting new anonymous token");
      this.session = null;
      await this.getAnonymousToken();
      return;
    }

    this.session.accessToken = data.access_token;
    this.session.expiresAt = Date.now() + data.expires_in * 1000 - 60000;
    await this.saveSession();
  }

  async authorize(): Promise<string> {
    console.error("[reddirect] Starting one-time authorization...");
    const result = await runOneTimeAuth();

    this.session = {
      accessToken: result.accessToken,
      refreshToken: null,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000, // token_v2 lasts ~24hrs
      username: result.username,
      scope: "*",
    };

    await this.saveSession();
    console.error(`[reddirect] Authorized as ${result.username}`);
    return result.username;
  }

  private getDeviceId(): string {
    return "DO_NOT_TRACK_THIS_DEVICE";
  }

  async get(endpoint: string): Promise<Response> {
    await this.ensureToken();
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${OAUTH_BASE}${endpoint}`;
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${this.session!.accessToken}`,
        "User-Agent": this.userAgent,
      },
    });
  }

  async getJson(endpoint: string): Promise<any> {
    const res = await this.get(endpoint);
    if (res.status === 401) {
      // Token expired, retry
      this.session = null;
      await this.ensureToken();
      const retry = await this.get(endpoint);
      return retry.json();
    }
    return res.json();
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastPostTime;
    if (elapsed < RedditClient.POST_DELAY_MS) {
      const wait = RedditClient.POST_DELAY_MS - elapsed;
      console.error(`[reddirect] Throttling write request (${wait}ms)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  private parseRetryDelay(message: string): number {
    const match = message.match(/(\d+)\s*(?:second|minute)/i);
    if (!match) return RedditClient.DEFAULT_RETRY_DELAY_MS;
    const value = parseInt(match[1], 10);
    if (message.toLowerCase().includes("minute")) return value * 60 * 1000;
    return value * 1000;
  }

  async post(
    endpoint: string,
    body: Record<string, string>
  ): Promise<any> {
    await this.ensureToken();
    if (!this.session?.username) {
      throw new Error(
        "Write operations require authentication. Run the 'authorize' tool first to connect your Reddit account (one-time browser authorization)."
      );
    }
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${OAUTH_BASE}${endpoint}`;

    for (let attempt = 0; attempt <= RedditClient.MAX_RETRIES; attempt++) {
      await this.throttle();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${this.session!.accessToken}`,
          "User-Agent": this.userAgent,
        },
        body: new URLSearchParams({
          ...body,
          api_type: "json",
        }),
      });
      this.lastPostTime = Date.now();
      const data = await res.json();

      const errors = data?.json?.errors;
      if (errors?.length && errors[0][0] === "RATELIMIT") {
        if (attempt < RedditClient.MAX_RETRIES) {
          const delay = this.parseRetryDelay(errors[0][1]);
          console.error(
            `[reddirect] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${RedditClient.MAX_RETRIES})`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      return data;
    }
  }

  getUsername(): string {
    return this.session?.username || "(anonymous)";
  }

  isAuthenticated(): boolean {
    return !!this.session?.username;
  }

  private async loadSession(): Promise<void> {
    try {
      const raw = await fs.readFile(this.sessionPath, "utf-8");
      this.session = JSON.parse(raw);
      console.error("[reddirect] Loaded saved session");
    } catch {
      // No saved session
    }
  }

  private async saveSession(): Promise<void> {
    if (!this.session) return;
    const dir = path.dirname(this.sessionPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.sessionPath, JSON.stringify(this.session));
  }
}
