import type { RedditClient } from "../reddit/client.js";
import type { QueueItem, WriteAction } from "./types.js";

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "q_";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function extractThingId(url: string): string | null {
  const commentMatch = url.match(
    /\/comments\/[a-z0-9]+\/[^/]*\/([a-z0-9]+)/i
  );
  if (commentMatch) return `t1_${commentMatch[1]}`;
  const postMatch = url.match(/\/comments\/([a-z0-9]+)/i);
  if (postMatch) return `t3_${postMatch[1]}`;
  return null;
}

export class QueueManager {
  private items: QueueItem[] = [];
  private processing = false;
  private readonly client: RedditClient;

  constructor(client: RedditClient) {
    this.client = client;
  }

  enqueue(
    action: WriteAction,
    params: Record<string, unknown>,
    minDelay = 120,
    maxDelay = 180
  ): QueueItem {
    const item: QueueItem = {
      id: generateId(),
      action,
      params,
      minDelay,
      maxDelay,
      status: "pending",
      enqueuedAt: Date.now(),
    };
    this.items.push(item);
    this.startProcessing();
    return item;
  }

  getItem(id: string): QueueItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  getAllItems(): QueueItem[] {
    return [...this.items];
  }

  cancel(id?: string): { cancelled: number } {
    let cancelled = 0;
    if (id) {
      const item = this.items.find(
        (i) => i.id === id && i.status === "pending"
      );
      if (item) {
        item.status = "failed";
        item.error = "Cancelled";
        item.completedAt = Date.now();
        cancelled = 1;
      }
    } else {
      for (const item of this.items) {
        if (item.status === "pending") {
          item.status = "failed";
          item.error = "Cancelled";
          item.completedAt = Date.now();
          cancelled++;
        }
      }
    }
    return { cancelled };
  }

  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    this.processLoop().catch((err) => {
      console.error("[reddirect] Queue processing error:", err);
      this.processing = false;
    });
  }

  private async processLoop(): Promise<void> {
    while (true) {
      const next = this.items.find((i) => i.status === "pending");
      if (!next) {
        this.processing = false;
        return;
      }

      const delay = randomDelay(next.minDelay, next.maxDelay);
      console.error(
        `[reddirect] Queue: waiting ${Math.round(delay / 1000)}s before executing ${next.action} (${next.id})`
      );
      await new Promise((r) => setTimeout(r, delay));

      // Check if it was cancelled during the wait
      if (next.status !== "pending") continue;

      next.status = "processing";
      next.executedAt = Date.now();

      try {
        next.result = await this.executeAction(
          next.action as WriteAction,
          next.params
        );
        next.status = "completed";
      } catch (err) {
        next.status = "failed";
        next.error = err instanceof Error ? err.message : String(err);
      }
      next.completedAt = Date.now();
    }
  }

  private async executeAction(
    action: WriteAction,
    params: Record<string, unknown>
  ): Promise<unknown> {
    switch (action) {
      case "create_post": {
        const p: Record<string, string> = {
          sr: params.subreddit as string,
          title: params.title as string,
          kind: (params.type as string) === "link" ? "link" : "self",
        };
        if (params.body) {
          p[(params.type as string) === "link" ? "url" : "text"] =
            params.body as string;
        }
        if (params.flair_text) {
          p.flair_text = params.flair_text as string;
        }
        const data = await this.client.post("/api/submit", p);
        const errors = data?.json?.errors;
        if (errors?.length) {
          throw new Error(
            errors.map((e: string[]) => e.join(": ")).join("; ")
          );
        }
        return {
          success: true,
          permalink: data?.json?.data?.url || null,
          id: data?.json?.data?.name || data?.json?.data?.id || null,
        };
      }

      case "reply": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        const data = await this.client.post("/api/comment", {
          thing_id: thingId,
          text: params.body as string,
        });
        const errors = data?.json?.errors;
        if (errors?.length) {
          throw new Error(
            errors.map((e: string[]) => e.join(": ")).join("; ")
          );
        }
        const commentData = data?.json?.data?.things?.[0]?.data;
        return {
          success: true,
          id: commentData?.name || null,
          replied_to: thingId,
        };
      }

      case "edit_content": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        const data = await this.client.post("/api/editusertext", {
          thing_id: thingId,
          text: params.new_body as string,
        });
        const errors = data?.json?.errors;
        if (errors?.length) {
          throw new Error(
            errors.map((e: string[]) => e.join(": ")).join("; ")
          );
        }
        return { success: true, id: thingId, edited: true };
      }

      case "delete_content": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        await this.client.post("/api/del", { id: thingId });
        return { success: true, id: thingId, deleted: true };
      }

      case "vote": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        const dir =
          params.direction === "up"
            ? "1"
            : params.direction === "down"
              ? "-1"
              : "0";
        await this.client.post("/api/vote", { id: thingId, dir });
        return {
          success: true,
          id: thingId,
          direction: params.direction,
        };
      }

      case "save_item": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        await this.client.post("/api/save", { id: thingId });
        return { success: true, id: thingId, saved: true };
      }

      case "unsave_item": {
        const thingId = extractThingId(params.url as string);
        if (!thingId) throw new Error("Could not extract ID from URL");
        await this.client.post("/api/unsave", { id: thingId });
        return { success: true, id: thingId, unsaved: true };
      }

      case "subscribe_subreddit": {
        await this.client.post("/api/subscribe", {
          sr_name: params.subreddit as string,
          action: "sub",
        });
        return {
          success: true,
          subreddit: params.subreddit,
          subscribed: true,
        };
      }

      case "unsubscribe_subreddit": {
        await this.client.post("/api/subscribe", {
          sr_name: params.subreddit as string,
          action: "unsub",
        });
        return {
          success: true,
          subreddit: params.subreddit,
          unsubscribed: true,
        };
      }

      case "mark_inbox_read": {
        await this.client.post("/api/read_all_messages", {});
        return { success: true, marked_all_read: true };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}
