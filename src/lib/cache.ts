import type { CachedActivationEntry, QuickPimDataCache } from "./types";

export const DATA_CACHE_KEY = "quickPimDataCache.v1";
export const DEFAULT_ELIGIBLE_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_ACTIVE_CACHE_TTL_MS = 60 * 1000;

export function isCacheEntryFresh(
  entry: CachedActivationEntry | undefined,
  ttlMs: number,
  now = Date.now()
): entry is CachedActivationEntry {
  return Boolean(entry && now - entry.fetchedAt < ttlMs);
}

export function formatCacheAge(fetchedAt: number | undefined, now = Date.now()): string {
  if (!fetchedAt) {
    return "not cached";
  }

  const ageMs = Math.max(0, now - fetchedAt);
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) {
    return "less than 1 min ago";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export async function loadDataCache(): Promise<QuickPimDataCache> {
  const result = await chrome.storage.local.get(DATA_CACHE_KEY);
  return (result[DATA_CACHE_KEY] as QuickPimDataCache | undefined) || {};
}

export async function saveDataCache(cache: QuickPimDataCache): Promise<void> {
  await chrome.storage.local.set({ [DATA_CACHE_KEY]: cache });
}

export async function clearDataCache(): Promise<void> {
  await chrome.storage.local.remove(DATA_CACHE_KEY);
}
