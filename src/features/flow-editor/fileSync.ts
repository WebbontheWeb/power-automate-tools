// Keeps the editor and a local .json file in sync, so other tools (AI coding
// assistants, text editors) can edit the flow while the extension stays the
// only thing that saves it. No browser or Monaco APIs here: the hook passes
// them in, which keeps this testable with mocks.

/** The parts of a FileSystemFileHandle the sync uses. */
export interface SyncFileHandle {
  readonly name: string;
  getFile(): Promise<{ lastModified: number; text(): Promise<string> }>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

/** The parts of FileSystemObserver the sync uses (Chrome 129+). */
export interface SyncFileObserver {
  observe(handle: SyncFileHandle): Promise<void>;
  disconnect(): void;
}

export type SyncFileObserverConstructor = new (
  callback: (records: unknown[]) => void
) => SyncFileObserver;

export type FileChangeDecision = 'unchanged' | 'apply' | 'ask';

/**
 * What to do with the file's content. The editor's text is only replaced
 * without asking when it holds nothing that isn't also in the file (last
 * sync) or on the server (baseline).
 */
export function decideFileChange({
  fileText,
  editorText,
  lastSynced,
  baseline,
}: {
  fileText: string;
  editorText: string;
  lastSynced: string | null;
  baseline: string | null;
}): FileChangeDecision {
  if (
    sameText(fileText, editorText) ||
    (lastSynced !== null && sameText(fileText, lastSynced))
  ) {
    return 'unchanged';
  }
  if (
    (lastSynced !== null && sameText(editorText, lastSynced)) ||
    (baseline !== null && sameText(editorText, baseline))
  ) {
    return 'apply';
  }
  return 'ask';
}

/**
 * Whether the saved version can be written to the file: only if the file
 * holds no changes the editor hasn't seen (it matches the last sync or what
 * was saved).
 */
export function canWriteBack({
  fileText,
  lastSynced,
  submittedText,
}: {
  fileText: string;
  lastSynced: string | null;
  submittedText: string;
}): boolean {
  return (
    (lastSynced !== null && sameText(fileText, lastSynced)) ||
    sameText(fileText, submittedText)
  );
}

/** Ignores line endings and trailing whitespace, which tools often change. */
export function sameText(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(text: string) {
  return text.replace(/\r\n/g, '\n').trimEnd();
}

function isJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export interface FileSyncOptions {
  handle: SyncFileHandle;
  getEditorText: () => string;
  /** The flow as last loaded from or saved to the server. */
  getBaseline: () => string | null;
  /** Replaces the editor's text as one undoable edit. */
  applyToEditor: (text: string) => void;
  /** Asks whether to replace unsaved editor edits with the file's content. */
  confirmReplace: () => boolean;
  onLoaded: () => void;
  onDeclined: () => void;
  onInvalidJson: () => void;
  /** Called when reading the file starts failing (not on every poll). */
  onReadError: (error: unknown) => void;
  /** False skips checks (the tab is hidden); call check() when it's true again. */
  isActive?: () => boolean;
  Observer?: SyncFileObserverConstructor;
  pollMs?: number;
  /** Slower safety-net poll used alongside a FileSystemObserver. */
  observedPollMs?: number;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (id: any) => void;
}

export interface FileSync {
  /** 'write' puts the editor's text in the file; 'read' loads the file. */
  start(initial: 'write' | 'read'): Promise<void>;
  stop(): void;
  /** Checks the file now (a poll tick, observer event or tab becoming visible). */
  check(): Promise<void>;
  /**
   * Runs fn with checks suspended, after any in-progress file access, so a
   * file change can't land in the editor mid-save.
   */
  whilePaused<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Writes the saved version to the file. 'conflict' when the file has
   * changes the editor hasn't loaded; they are left in place.
   */
  writeSaved(
    savedText: string,
    submittedText: string
  ): Promise<'written' | 'conflict' | 'stopped'>;
}

export function createFileSync(options: FileSyncOptions): FileSync {
  const { handle } = options;
  const setTimer = options.setInterval ?? ((cb, ms) => setInterval(cb, ms));
  const clearTimer = options.clearInterval ?? ((id) => clearInterval(id));

  let lastModified: number | null = null;
  let lastSynced: string | null = null;
  let stopped = false;
  let paused = 0;
  let checking = false;
  let failing = false;
  let timer: unknown = null;
  let observer: SyncFileObserver | null = null;

  // File reads and writes run one at a time.
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const write = async (text: string) => {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    lastSynced = text;
    lastModified = (await handle.getFile()).lastModified;
  };

  const readFile = async () => {
    try {
      const file = await handle.getFile();
      if (file.lastModified === lastModified) {
        failing = false;
        return null;
      }
      const result = { lastModified: file.lastModified, text: await file.text() };
      failing = false;
      return result;
    } catch (error) {
      // Editors that save by replacing the file can make it briefly missing;
      // report once and keep polling.
      if (!failing) {
        failing = true;
        options.onReadError(error);
      }
      return null;
    }
  };

  const canCheck = () =>
    !stopped && !paused && (options.isActive ? options.isActive() : true);

  const doCheck = async () => {
    if (!canCheck()) {
      return;
    }
    const file = await readFile();
    // A save may have started (or the tab been hidden) while reading.
    if (!file || !canCheck()) {
      return;
    }
    lastModified = file.lastModified;

    if (!isJson(file.text)) {
      // Possibly a partial write; the next change is checked again.
      options.onInvalidJson();
      return;
    }

    const editorText = options.getEditorText();
    const decision = decideFileChange({
      fileText: file.text,
      editorText,
      lastSynced,
      baseline: options.getBaseline(),
    });

    if (decision === 'unchanged') {
      if (sameText(file.text, editorText)) {
        lastSynced = file.text;
      }
      return;
    }

    // Remembered either way, so a declined version isn't asked about again.
    lastSynced = file.text;
    if (decision === 'ask' && !options.confirmReplace()) {
      options.onDeclined();
      return;
    }
    options.applyToEditor(file.text);
    options.onLoaded();
  };

  const check = async () => {
    // Skipped rather than queued: the next tick sees the same change.
    if (checking || !canCheck()) {
      return;
    }
    checking = true;
    try {
      await exclusive(doCheck);
    } finally {
      checking = false;
    }
  };

  return {
    async start(initial) {
      if (initial === 'write') {
        await exclusive(() => write(options.getEditorText()));
      } else {
        await check();
      }
      if (stopped) {
        return;
      }

      if (options.Observer) {
        try {
          observer = new options.Observer(() => {
            check();
          });
          await observer.observe(handle);
        } catch {
          observer = null;
        }
      }
      if (stopped) {
        observer?.disconnect();
        return;
      }
      timer = setTimer(
        () => {
          check();
        },
        observer ? options.observedPollMs ?? 5000 : options.pollMs ?? 1500
      );
    },
    stop() {
      stopped = true;
      observer?.disconnect();
      observer = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
    check,
    async whilePaused(fn) {
      paused++;
      try {
        await exclusive(async () => undefined);
        return await fn();
      } finally {
        paused--;
      }
    },
    writeSaved(savedText, submittedText) {
      return exclusive(async () => {
        if (stopped) {
          return 'stopped' as const;
        }
        const file = await handle.getFile();
        const fileText = await file.text();
        if (!canWriteBack({ fileText, lastSynced, submittedText })) {
          return 'conflict' as const;
        }
        await write(savedText);
        return 'written' as const;
      });
    },
  };
}
