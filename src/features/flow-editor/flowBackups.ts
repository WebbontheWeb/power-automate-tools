export interface FlowBackup {
  savedAt: string;
  name: string;
  content: string;
}

// Backups hold full flow definitions, which can include secrets typed into
// actions, in the browser profile unencrypted. Keep them few and short-lived.
const MAX_BACKUPS_PER_FLOW = 10;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// chrome.storage.local allows 10 MB (5 MB before Chrome 114); stay well under
// it so saving never fails on quota.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const BACKUP_PREFIX = 'backups:';
const ENABLED_KEY = 'settings:backupsEnabled';

const backupKey = (flowId: string) => `${BACKUP_PREFIX}${flowId}`;

const sizeOf = (backup: FlowBackup) => JSON.stringify(backup).length;

/** Backups for a flow, newest first, with content formatted for the editor. */
export async function getFlowBackups(flowId: string): Promise<FlowBackup[]> {
  await pruneBackups();
  const key = backupKey(flowId);
  const items = await chrome.storage.local.get(key);
  const backups: FlowBackup[] = items[key] || [];
  return backups.map((backup) => ({
    ...backup,
    content: JSON.stringify(JSON.parse(backup.content), null, 2),
  }));
}

/**
 * Stores a backup, newest first. Throws if it can't be kept (for example a
 * flow too large for the size cap) so the caller can ask before saving.
 */
export async function addFlowBackup(
  flowId: string,
  backup: FlowBackup
): Promise<void> {
  const compact: FlowBackup = {
    ...backup,
    content: JSON.stringify(JSON.parse(backup.content)),
  };
  if (sizeOf(compact) > MAX_TOTAL_BYTES) {
    throw new Error('the flow is too large to back up');
  }

  const key = backupKey(flowId);
  const items = await chrome.storage.local.get(key);
  const backups: FlowBackup[] = items[key] || [];
  await chrome.storage.local.set({
    [key]: [compact, ...backups].slice(0, MAX_BACKUPS_PER_FLOW),
  });
  await pruneBackups();
}

export async function deleteFlowBackups(flowId: string): Promise<void> {
  await chrome.storage.local.remove(backupKey(flowId));
}

export async function deleteAllBackups(): Promise<void> {
  const items = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(
    Object.keys(items).filter((key) => key.startsWith(BACKUP_PREFIX))
  );
}

export async function getBackupsEnabled(): Promise<boolean> {
  const items = await chrome.storage.local.get(ENABLED_KEY);
  return items[ENABLED_KEY] !== false;
}

export async function setBackupsEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
}

/** Drops expired backups, then the oldest across all flows until under the size cap. */
async function pruneBackups(): Promise<void> {
  const items = await chrome.storage.local.get(null);
  const cutoff = Date.now() - MAX_AGE_MS;

  const all: { key: string; backup: FlowBackup }[] = [];
  for (const key of Object.keys(items)) {
    if (key.startsWith(BACKUP_PREFIX)) {
      for (const backup of items[key] as FlowBackup[]) {
        all.push({ key, backup });
      }
    }
  }

  const kept = all
    .filter(({ backup }) => Date.parse(backup.savedAt) >= cutoff)
    .sort((a, b) => b.backup.savedAt.localeCompare(a.backup.savedAt));

  let total = 0;
  const keptByKey: Record<string, FlowBackup[]> = {};
  for (const { key, backup } of kept) {
    total += sizeOf(backup);
    if (total > MAX_TOTAL_BYTES) {
      break;
    }
    (keptByKey[key] = keptByKey[key] || []).push(backup);
  }

  const toSet: Record<string, FlowBackup[]> = {};
  const toRemove: string[] = [];
  for (const key of Object.keys(items)) {
    if (!key.startsWith(BACKUP_PREFIX)) {
      continue;
    }
    if (!keptByKey[key]) {
      toRemove.push(key);
    } else if (keptByKey[key].length !== items[key].length) {
      toSet[key] = keptByKey[key];
    }
  }

  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove);
  }
  if (Object.keys(toSet).length) {
    await chrome.storage.local.set(toSet);
  }
}
