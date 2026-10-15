export interface FlowBackup {
  savedAt: string;
  name: string;
  content: string;
}

const MAX_BACKUPS_PER_FLOW = 10;

const backupKey = (flowId: string) => `backups:${flowId}`;

export async function getFlowBackups(flowId: string): Promise<FlowBackup[]> {
  const key = backupKey(flowId);
  const items = await chrome.storage.local.get(key);
  return items[key] || [];
}

/** Stores a backup, newest first, keeping the last MAX_BACKUPS_PER_FLOW. */
export async function addFlowBackup(
  flowId: string,
  backup: FlowBackup
): Promise<void> {
  const backups = await getFlowBackups(flowId);
  await chrome.storage.local.set({
    [backupKey(flowId)]: [backup, ...backups].slice(0, MAX_BACKUPS_PER_FLOW),
  });
}
