import express from "express";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import {
  createExpressApp,
  processDueSchedules,
  syncAgentListeners,
} from "./server/app.ts";
import { readStore } from "./server/store.ts";
import {
  isUserListenerActive,
  startUserGroupListener,
} from "./server/telegramUser.ts";
import {
  isBotListenerActive,
  startBotGroupListener,
} from "./server/telegramBotListener.ts";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);

export { createExpressApp };

export async function createApp(
  httpServer?: http.Server
): Promise<express.Express> {
  const app = createExpressApp();

  if (process.env.NODE_ENV !== "production" && !IS_VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const hmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ...(httpServer
          ? {
              ws: { server: httpServer },
              hmr: hmrDisabled ? false : { server: httpServer },
            }
          : {}),
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!IS_VERCEL) {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

let cachedAppPromise: Promise<express.Express> | null = null;

export function getApp(): Promise<express.Express> {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp();
  }
  return cachedAppPromise;
}

async function startServer() {
  const httpServer = http.createServer();
  const app = await createApp(httpServer);
  httpServer.on("request", app);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`TelePoll Agent server running on http://0.0.0.0:${PORT}`);
    void syncAgentListeners().catch((err) => {
      console.warn("Could not start saved Telegram listener on boot:", err);
    });
  });

  // Background scheduler tick every 10 seconds
  setInterval(() => {
    void processDueSchedules();
  }, 10_000);

  // Keep-alive watchdog: auto-heal Telegram group agent listener every 30s if disconnected
  setInterval(() => {
    const cfg = readStore().config;
    if (!cfg.agentListenerEnabled) return;
    if (
      cfg.authMode === "user" &&
      cfg.sessionString &&
      cfg.apiId &&
      cfg.apiHash &&
      cfg.controlGroupId &&
      !isUserListenerActive()
    ) {
      void startUserGroupListener().catch(() => {});
    } else if (
      cfg.authMode === "bot" &&
      cfg.botToken.trim() &&
      !isBotListenerActive()
    ) {
      startBotGroupListener();
    }
  }, 30_000);
}

if (!IS_VERCEL && process.env.TELEPOLL_NO_LISTEN !== "true") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
