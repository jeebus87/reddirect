import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueueManager } from "../queue/manager.js";
import { WRITE_ACTIONS } from "../queue/types.js";
import type { WriteAction } from "../queue/types.js";

export function register(server: McpServer, queue: QueueManager): void {
  server.registerTool(
    "queue_action",
    {
      title: "Queue Write Action",
      description:
        "Enqueue a write operation for delayed execution. Returns immediately with a queue ID. The action will be executed after a random delay within the specified range. Use queue_status to check progress.",
      inputSchema: z.object({
        action: z
          .enum(WRITE_ACTIONS)
          .describe("The write operation to execute"),
        params: z
          .record(z.unknown())
          .describe(
            "Parameters for the action — same as calling the tool directly"
          ),
        min_delay: z
          .number()
          .int()
          .min(0)
          .default(120)
          .describe("Minimum seconds to wait before execution (default: 120)"),
        max_delay: z
          .number()
          .int()
          .min(0)
          .default(180)
          .describe("Maximum seconds to wait before execution (default: 180)"),
      }),
    },
    async ({ action, params, min_delay, max_delay }) => {
      try {
        const effectiveMax = Math.max(min_delay, max_delay);
        const item = queue.enqueue(
          action as WriteAction,
          params as Record<string, unknown>,
          min_delay,
          effectiveMax
        );

        const delayRange =
          min_delay === effectiveMax
            ? `${min_delay}s`
            : `${min_delay}-${effectiveMax}s`;

        const pending = queue
          .getAllItems()
          .filter((i) => i.status === "pending" || i.status === "processing");

        let estimatedWait = 0;
        for (const p of pending) {
          if (p.id === item.id) break;
          estimatedWait += (p.minDelay + p.maxDelay) / 2;
        }
        estimatedWait += (min_delay + effectiveMax) / 2;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  queued: true,
                  queue_id: item.id,
                  action: item.action,
                  position: pending.findIndex((p) => p.id === item.id) + 1,
                  delay_range: delayRange,
                  estimated_execution_seconds: Math.round(estimatedWait),
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
              text: `Error queuing action: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "queue_status",
    {
      title: "Check Queue Status",
      description:
        "Check the status of queued actions. Provide a queue_id for a specific item, or omit to see the full queue.",
      inputSchema: z.object({
        queue_id: z
          .string()
          .optional()
          .describe("Queue item ID. Omit to see all items."),
      }),
    },
    async ({ queue_id }) => {
      try {
        if (queue_id) {
          const item = queue.getItem(queue_id);
          if (!item) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: `No item found with id: ${queue_id}` },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(item, null, 2) },
            ],
          };
        }

        const all = queue.getAllItems();
        const summary = {
          total: all.length,
          pending: all.filter((i) => i.status === "pending").length,
          processing: all.filter((i) => i.status === "processing").length,
          completed: all.filter((i) => i.status === "completed").length,
          failed: all.filter((i) => i.status === "failed").length,
          items: all,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error checking queue: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "queue_cancel",
    {
      title: "Cancel Queued Actions",
      description:
        "Cancel a specific queued action by ID, or cancel all pending actions. Items currently processing will run to completion.",
      inputSchema: z.object({
        queue_id: z
          .string()
          .optional()
          .describe(
            "Queue item ID to cancel. Omit to cancel all pending items."
          ),
      }),
    },
    async ({ queue_id }) => {
      try {
        const result = queue.cancel(queue_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  cancelled: result.cancelled,
                  ...(queue_id ? { queue_id } : { scope: "all_pending" }),
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
              text: `Error cancelling: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
