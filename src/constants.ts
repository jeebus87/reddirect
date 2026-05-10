import path from "node:path";
import os from "node:os";

export const BASE_URL = "https://old.reddit.com";

export const DEFAULT_SESSION_PATH = path.join(
  os.homedir(),
  ".reddirect",
  "session.json"
);
