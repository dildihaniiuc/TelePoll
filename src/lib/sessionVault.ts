import type { PublicTelegramConfig, ScheduledPollJob } from "../types";

const VAULT_KEY = "telepoll_persistent_vault_v1";

export async function syncSessionVault(): Promise<void> {
  try {
    const res = await fetch("/api/telegram/backup");
    if (!res.ok) return;
    const data = (await res.json()) as {
      bundle?: {
        config?: Record<string, unknown>;
        jobs?: ScheduledPollJob[];
      };
    };
    const cfg = data.bundle?.config;
    if (!cfg) return;

    const hasAnyCreds = Boolean(
      cfg.sessionString || cfg.botToken || (cfg.apiId && cfg.apiHash)
    );
    if (hasAnyCreds) {
      const compactJobs = Array.isArray(data.bundle?.jobs)
        ? data.bundle.jobs.map((job) =>
            job.status === "posted" && job.imageBase64
              ? { ...job, imageBase64: undefined }
              : job
          )
        : undefined;
      const compactBundle = {
        ...data.bundle,
        ...(compactJobs ? { jobs: compactJobs } : {}),
      };
      localStorage.setItem(VAULT_KEY, JSON.stringify(compactBundle));
    } else {
      localStorage.removeItem(VAULT_KEY);
    }
  } catch {
    // Ignore storage quota or transient network errors
  }
}

export async function restoreSessionVaultIfNeeded(
  serverConfig: PublicTelegramConfig
): Promise<{
  restored: boolean;
  config?: PublicTelegramConfig;
  jobs?: ScheduledPollJob[];
}> {
  if (
    serverConfig.hasUserSession ||
    serverConfig.hasBotToken ||
    serverConfig.hasApiCredentials
  ) {
    return { restored: false };
  }

  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return { restored: false };
    const bundle = JSON.parse(raw) as {
      config?: Record<string, unknown>;
      jobs?: ScheduledPollJob[];
    };
    if (!bundle?.config) return { restored: false };

    const res = await fetch("/api/telegram/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    if (!res.ok) return { restored: false };
    const data = (await res.json()) as {
      restored?: boolean;
      config?: PublicTelegramConfig;
      jobs?: ScheduledPollJob[];
    };
    return {
      restored: Boolean(data.restored),
      config: data.config,
      jobs: data.jobs,
    };
  } catch {
    return { restored: false };
  }
}
