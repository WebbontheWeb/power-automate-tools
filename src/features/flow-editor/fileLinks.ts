import { SyncFileHandle, SyncFileObserverConstructor } from './fileSync';

// File System Access API pieces missing from this TypeScript version's DOM
// types. Only the methods used here are declared.
export interface LinkedFileHandle extends SyncFileHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: {
    mode: 'readwrite';
  }): Promise<PermissionState>;
}

interface FilePickerOptions {
  id?: string;
  startIn?: string;
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemAccessWindow {
  showSaveFilePicker?: (
    options?: FilePickerOptions
  ) => Promise<LinkedFileHandle>;
  showOpenFilePicker?: (
    options?: FilePickerOptions & { multiple?: false }
  ) => Promise<LinkedFileHandle[]>;
  FileSystemObserver?: SyncFileObserverConstructor;
}

const fsWindow = window as unknown as FileSystemAccessWindow;

const pickerOptions: FilePickerOptions = {
  id: 'flow-json',
  startIn: 'documents',
  types: [
    { description: 'Flow JSON', accept: { 'application/json': ['.json'] } },
  ],
};

export const fileSyncSupported = () =>
  !!fsWindow.showSaveFilePicker && !!fsWindow.showOpenFilePicker;

export const fileObserver = () => fsWindow.FileSystemObserver;

/** Asks for a new (or overwritten) file. Null if the user cancels. */
export async function pickNewFile(
  suggestedName: string
): Promise<LinkedFileHandle | null> {
  try {
    return await fsWindow.showSaveFilePicker!({
      ...pickerOptions,
      suggestedName,
    });
  } catch (error) {
    return ignoreAbort(error);
  }
}

/** Asks for an existing file. Null if the user cancels. */
export async function pickExistingFile(): Promise<LinkedFileHandle | null> {
  try {
    const [handle] = await fsWindow.showOpenFilePicker!(pickerOptions);
    return handle;
  } catch (error) {
    return ignoreAbort(error);
  }
}

/**
 * Whether the page may read and write the file. With request, prompts the
 * user if needed, which only works during a click or key press.
 */
export async function hasFilePermission(
  handle: LinkedFileHandle,
  request: boolean
): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(descriptor)) === 'granted') {
    return true;
  }
  return request && (await handle.requestPermission(descriptor)) === 'granted';
}

/** A file name for the flow, without characters Windows doesn't allow. */
export function suggestedFileName(flowName: string) {
  const base = flowName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return (base || 'flow') + '.json';
}

function ignoreAbort(error: unknown): null {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return null;
  }
  throw error;
}

// File handles can't go in chrome.storage, but IndexedDB can store them, so
// the link survives reopening the editor. Only the handle is stored, never
// file content.
const DB_NAME = 'power-automate-tools';
const STORE = 'fileLinks';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getLinkedFile(
  flowId: string
): Promise<LinkedFileHandle | null> {
  return (
    (await withStore<LinkedFileHandle | undefined>('readonly', (store) =>
      store.get(flowId)
    )) ?? null
  );
}

export async function setLinkedFile(
  flowId: string,
  handle: LinkedFileHandle
): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, flowId));
}

export async function deleteLinkedFile(flowId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(flowId));
}
