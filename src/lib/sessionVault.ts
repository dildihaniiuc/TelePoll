import type { PublicTelegramConfig, ScheduledPollJob } from "../types";

const VAULT_KEY = "telepoll_persistent_vault_v1";
const IDB_NAME = "telepoll_persistent_db";
const IDB_STORE = "vault";
const IDB_KEY = "session_bundle_v1";

interface VaultBundle {
  config?: Record<string, unknown>;
  jobs?: ScheduledPollJob[];
  savedAt?: string;
}

let interceptorInstalled = false;
let rawFetchFn: typeof window.fetch | null = null;
let inflightRestorePromise: Promise<{
  restored: boolean;
  config?: PublicTelegramConfig;
  jobs?: ScheduledPollJob[];
}> | null = null;

function getNativeFetch(): typeof window.fetch {
  return rawFetchFn || window.fetch.bind(window);
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open error"));
  });
}

async function writeBundleToIndexedDB(bundle: VaultBundle): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(bundle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IndexedDB quota/privacy mode failures
  }
}

async function readBundleFromIndexedDB(): Promise<VaultBundle | null> {
  try {
    const db = await openVaultDb();
    const val = await new Promise<VaultBundle | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as VaultBundle) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val;
  } catch {
    return null;
  }
}

async function deleteBundleFromIndexedDB(): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

async function saveVaultBundle(bundle: VaultBundle): Promise<void> {
  const stamped: VaultBundle = {
    ...bundle,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(stamped));
  } catch {
    // Ignore localStorage quota error
  }
  await writeBundleToIndexedDB(stamped);
  try {
    if (navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported storage.persist
  }
}

export async function readSavedVaultBundle(): Promise<VaultBundle | null> {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VaultBundle;
      if (parsed?.config && hasCredentialsInConfig(parsed.config)) {
        return parsed;
      }
    }
  } catch {
    // Fall through to IndexedDB
  }

  const idbBundle = await readBundleFromIndexedDB();
  if (idbBundle?.config && hasCredentialsInConfig(idbBundle.config)) {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(idbBundle));
    } catch {
      // Ignore
    }
    return idbBundle;
  }
  return null;
}

function hasCredentialsInConfig(cfg: Record<string, unknown>): boolean {
  return Boolean(
    (cfg.sessionString && cfg.apiId && cfg.apiHash) || cfg.botToken
  );
}

/**
 * Only called when the user explicitly clicks Disconnect Account or Clear Bot Token.
 * Never wiped automatically by server cold-starts or sync checks.
 */
export async function clearSessionVault(
  scope: "user" | "bot" | "all" = "all"
): Promise<void> {
  if (scope === "all") {
    try {
      localStorage.removeItem(VAULT_KEY);
    } catch {
      // Ignore
    }
    await deleteBundleFromIndexedDB();
    return;
  }

  const existing = await readSavedVaultBundle();
  if (!existing?.config) return;

  const nextCfg = { ...existing.config };
  if (scope === "user") {
    delete nextCfg.sessionString;
    delete nextCfg.userId;
    delete nextCfg.userDisplayName;
    delete nextCfg.userUsername;
    delete nextCfg.userPhone;
    if (nextCfg.authMode === "user") {
      delete nextCfg.verifiedAt;
    }
  } else if (scope === "bot") {
    nextCfg.botToken = "";
    delete nextCfg.botUsername;
    if (nextCfg.authMode === "bot") {
      delete nextCfg.verifiedAt;
    }
  }

  if (hasCredentialsInConfig(nextCfg)) {
    await saveVaultBundle({ ...existing, config: nextCfg });
  } else {
    try {
      localStorage.removeItem(VAULT_KEY);
    } catch {
      // Ignore
    }
    await deleteBundleFromIndexedDB();
  }
}

export async function syncSessionVault(): Promise<void> {
  try {
    const fetchImpl = getNativeFetch();
    const res = await fetchImpl("/api/telegram/backup");
    if (!res.ok) return;
    const data = (await res.json()) as {
      bundle?: VaultBundle;
    };
    const cfg = data.bundle?.config;
    if (!cfg) return;

    // IMPORTANT: Never overwrite/erase an existing local vault if server restarted empty!
    if (!hasCredentialsInConfig(cfg)) {
      return;
    }

    const compactJobs = Array.isArray(data.bundle?.jobs)
      ? data.bundle.jobs.map((job) =>
          job.status === "posted" && job.imageBase64
            ? { ...job, imageBase64: undefined }
            : job
        )
      : undefined;

    await saveVaultBundle({
      ...data.bundle,
      ...(compactJobs ? { jobs: compactJobs } : {}),
    });
  } catch {
    // Ignore storage quota or transient network errors
  }
}

export async function restoreSessionVaultFromLocal(): Promise<{
  restored: boolean;
  config?: PublicTelegramConfig;
  jobs?: ScheduledPollJob[];
}> {
  if (inflightRestorePromise) {
    return inflightRestorePromise;
  }

  inflightRestorePromise = (async () => {
    try {
      const bundle = await readSavedVaultBundle();
      if (!bundle?.config) return { restored: false };

      const fetchImpl = getNativeFetch();
      const res = await fetchImpl("/api/telegram/restore", {
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
    } finally {
      inflightRestorePromise = null;
    }
  })();

  return inflightRestorePromise;
}

export async function restoreSessionVaultIfNeeded(
  serverConfig: PublicTelegramConfig
): Promise<{
  restored: boolean;
  config?: PublicTelegramConfig;
  jobs?: ScheduledPollJob[];
}> {
  if (serverConfig.hasUserSession || serverConfig.hasBotToken) {
    return { restored: false };
  }
  return restoreSessionVaultFromLocal();
}

/**
 * Installs a transparent fetch guard so if a serverless cold-start wipes server memory//tmp,
 * any /api/* call automatically restores the saved Telegram session and retries once.
 */
export function installPersistentSessionInterceptor(): void {
  if (interceptorInstalled || typeof window === "undefined") return;
  interceptorInstalled = true;

  try {
    if (typeof window.fetch !== "function") return;
    rawFetchFn = window.fetch.bind(window);
    const nativeFetch = rawFetchFn;

    const guardedFetch: typeof window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname + input.search
            : input.url;

      const method = (
        init?.method ||
        (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      const isSameOriginApi =
        urlStr.startsWith("/api/") ||
        urlStr.startsWith(`${window.location.origin}/api/`);

      const response = await nativeFetch(input, init);

      if (
        !isSameOriginApi ||
        urlStr.includes("/api/telegram/restore") ||
        urlStr.includes("/api/telegram/backup") ||
        (method === "DELETE" && urlStr.includes("/api/telegram/user/session")) ||
        (method === "DELETE" && urlStr.includes("/api/telegram/token"))
      ) {
        return response;
      }

      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403
      ) {
        try {
          const cloned = response.clone();
          const body = (await cloned.json().catch(() => null)) as
            | { error?: string }
            | null;
          const errMsg = (body?.error || "").toLowerCase();
          const isMissingAuthError =
            errMsg.includes("not signed in") ||
            errMsg.includes("not selected") ||
            errMsg.includes("bot token is required") ||
            errMsg.includes("telegram session is required");

          if (isMissingAuthError) {
            const restored = await restoreSessionVaultFromLocal();
            if (restored.restored) {
              return nativeFetch(input, init);
            }
          }
        } catch {
          // Return original response if clone/restore fails
        }
      }

      return response;
    };

    const ownDesc = Object.getOwnPropertyDescriptor(window, "fetch");
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(window, "fetch", {
        value: guardedFetch,
        configurable: true,
        writable: true,
      });
    } else if (ownDesc.writable) {
      window.fetch = guardedFetch;
    }
  } catch {
    // Some sandboxed iframe runtimes lock window.fetch; App polling & loadConfig still restore automatically.
  }
}
