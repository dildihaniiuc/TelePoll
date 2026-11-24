import type { IncomingMessage, ServerResponse } from "http";
import { createExpressApp } from "../server/app.ts";

export const config = {
  maxDuration: 60,
};

const app = createExpressApp();

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  return app(
    req as Parameters<typeof app>[0],
    res as Parameters<typeof app>[1]
  );
}
