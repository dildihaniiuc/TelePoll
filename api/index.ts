import type { IncomingMessage, ServerResponse } from "http";
import { createExpressApp } from "../server/app.ts";

export const config = {
  maxDuration: 60,
};

const app = createExpressApp();

function restoreOriginalApiUrl(req: IncomingMessage): void {
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    const rewrittenPath = parsed.searchParams.get("__path");
    if (rewrittenPath) {
      parsed.searchParams.delete("__path");
      const normalizedPath = rewrittenPath.startsWith("/api")
        ? rewrittenPath
        : `/api/${rewrittenPath.replace(/^\/+/, "")}`;
      const qs = parsed.searchParams.toString();
      req.url = qs ? `${normalizedPath}?${qs}` : normalizedPath;
      return;
    }

    if (parsed.pathname === "/api/index") {
      const fwdUri =
        (req.headers["x-forwarded-uri"] as string | undefined) ||
        (req.headers["x-original-url"] as string | undefined) ||
        (req.headers["x-invoke-path"] as string | undefined);
      if (fwdUri && fwdUri.startsWith("/api/") && !fwdUri.startsWith("/api/index")) {
        req.url = fwdUri;
      }
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }
}

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  restoreOriginalApiUrl(req);
  return app(
    req as Parameters<typeof app>[0],
    res as Parameters<typeof app>[1]
  );
}
