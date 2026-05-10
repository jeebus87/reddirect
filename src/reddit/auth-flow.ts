import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const CDP_PORT = 9876;

interface AuthResult {
  accessToken: string;
  username: string;
}

/**
 * One-time auth: opens a Chrome window for the user to log into Reddit.
 * After login, extracts the token_v2 JWT via Chrome DevTools Protocol.
 * No Playwright, no API keys, no app registration.
 */
export async function runOneTimeAuth(): Promise<AuthResult> {
  const chromePath = await findChrome();
  const tempProfile = path.join(os.tmpdir(), "reddirect-auth-profile");
  await fs.mkdir(tempProfile, { recursive: true });

  console.error("[reddirect] Opening Chrome for Reddit login...");
  console.error(
    "[reddirect] Log into your Reddit account in the browser window.\n"
  );

  // Launch Chrome with a temp profile and debug port
  // Use 'start' on Windows to ensure the window is visible
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=800,700",
    "https://www.reddit.com/login/",
  ];

  let chromeProcess: ReturnType<typeof spawn>;
  if (process.platform === "win32") {
    chromeProcess = spawn("cmd", ["/c", "start", "", chromePath, ...args], {
      stdio: "ignore",
      shell: false,
    });
  } else {
    chromeProcess = spawn(chromePath, args, {
      stdio: "ignore",
      detached: true,
    });
  }

  try {
    await waitForCDP();
    const token = await pollForLogin();

    console.error("[reddirect] Login detected! Extracting session...");
    const username = await fetchUsername(token);

    return { accessToken: token, username };
  } finally {
    // Kill Chrome and the debug port
    if (process.platform === "win32") {
      // Find and kill Chrome on our debug port
      spawn("cmd", ["/c", "taskkill", "/F", "/IM", "chrome.exe", "/FI", `WINDOWTITLE eq *reddirect*`], {
        stdio: "ignore",
      });
      // More reliable: kill by the temp profile directory
      try {
        const { execSync } = await import("node:child_process");
        execSync(
          `wmic process where "CommandLine like '%reddirect-auth-profile%'" call terminate`,
          { stdio: "ignore" }
        );
      } catch {
        // Best effort
      }
    } else {
      chromeProcess.kill();
    }
    // Clean up temp profile
    await fs.rm(tempProfile, { recursive: true, force: true }).catch(() => {});
  }
}

async function waitForCDP(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`http://localhost:${CDP_PORT}/json`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Chrome failed to start. Is Google Chrome installed?");
}

async function pollForLogin(): Promise<string> {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const tabs = await fetch(`http://localhost:${CDP_PORT}/json`).then((r) =>
        r.json()
      );
      const tab = tabs.find(
        (t: any) => t.url?.includes("reddit.com") && t.type === "page"
      );
      if (!tab?.webSocketDebuggerUrl) continue;

      const cookies = await getCookiesViaCDP(tab.webSocketDebuggerUrl);
      const tokenCookie = cookies.find((c: any) => c.name === "token_v2");

      if (!tokenCookie?.value) continue;

      const payload = JSON.parse(
        Buffer.from(tokenCookie.value.split(".")[1], "base64").toString()
      );

      if (payload.sub && payload.sub !== "loid") {
        return tokenCookie.value;
      }
    } catch {
      // CDP connection error, keep polling
    }
  }

  throw new Error(
    "Login timed out (5 minutes). Please log in to Reddit in the browser window."
  );
}

function getCookiesViaCDP(wsUrl: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("CDP timeout"));
    }, 5000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Network.getCookies",
          params: {
            urls: [
              "https://www.reddit.com",
              "https://old.reddit.com",
              "https://reddit.com",
            ],
          },
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id === 1) {
        clearTimeout(timeout);
        ws.close();
        resolve(msg.result?.cookies || []);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("CDP WebSocket error"));
    };
  });
}

async function fetchUsername(token: string): Promise<string> {
  const res = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "reddirect:v1.0.0 (MCP server)",
    },
  });
  const data = await res.json();
  return data?.name || "";
}

async function findChrome(): Promise<string> {
  const paths =
    process.platform === "win32"
      ? [
          path.join(
            process.env.PROGRAMFILES || "",
            "Google/Chrome/Application/chrome.exe"
          ),
          path.join(
            process.env["PROGRAMFILES(X86)"] || "",
            "Google/Chrome/Application/chrome.exe"
          ),
          path.join(
            process.env.LOCALAPPDATA || "",
            "Google/Chrome/Application/chrome.exe"
          ),
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["google-chrome", "chromium-browser", "chromium"];

  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Chrome not found. Install Google Chrome to use authorization."
  );
}
