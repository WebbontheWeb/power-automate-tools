import { MessageBarButton } from '@fluentui/react/lib/Button';
import {
  IMessageBarProps,
  MessageBarType,
} from '@fluentui/react/lib/MessageBar';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { createElement, useEffect, useRef, useState } from 'react';
import {
  deleteLinkedFile,
  fileObserver,
  fileSyncSupported,
  getLinkedFile,
  hasFilePermission,
  LinkedFileHandle,
  pickExistingFile,
  pickNewFile,
  setLinkedFile,
  suggestedFileName,
} from './fileLinks';
import { createFileSync, FileSync } from './fileSync';

const messageKey = 'file-sync';

export interface UseFileSyncOptions {
  flowId: string | null;
  flowName: string;
  editor: monaco.editor.IStandaloneCodeEditor | null;
  getBaseline: () => string | null;
  setMessages: React.Dispatch<React.SetStateAction<IMessageBarProps[]>>;
}

/**
 * Links the editor to a local .json file: the file's changes load into the
 * editor for review, and saved versions are written back. Only the editor's
 * JSON is ever written to disk.
 */
export const useFileSync = ({
  flowId,
  flowName,
  editor,
  getBaseline,
  setMessages,
}: UseFileSyncOptions) => {
  const [linkedFile, setLinkedFileState] = useState<{
    name: string;
    syncing: boolean;
  } | null>(null);
  const handleRef = useRef<LinkedFileHandle | null>(null);
  const syncRef = useRef<FileSync | null>(null);

  // Shown next to other messages rather than replacing them.
  const showMessage = (
    text: string,
    type: MessageBarType,
    actions?: JSX.Element
  ) =>
    setMessages((prev) => [
      ...prev.filter((msg) => msg.key !== messageKey),
      { key: messageKey, messageBarType: type, children: text, actions },
    ]);

  const clearMessage = () =>
    setMessages((prev) => prev.filter((msg) => msg.key !== messageKey));

  const stopSync = () => {
    syncRef.current?.stop();
    syncRef.current = null;
  };

  const showReconnect = (name: string) =>
    showMessage(
      `Linked to ${name}, but the browser needs your permission again to read and write it.`,
      MessageBarType.warning,
      createElement(MessageBarButton, {
        text: 'Reconnect',
        onClick: () => {
          reconnect();
        },
      })
    );

  const startSync = async (
    handle: LinkedFileHandle,
    initial: 'write' | 'read'
  ) => {
    if (!editor) {
      return false;
    }
    stopSync();
    handleRef.current = handle;
    const name = handle.name;

    const sync = createFileSync({
      handle,
      getEditorText: () => editor.getValue(),
      getBaseline,
      applyToEditor: (text) => {
        const model = editor.getModel();
        if (!model) {
          return;
        }
        // One undo step, so Ctrl+Z brings back the previous text.
        model.pushStackElement();
        model.pushEditOperations(
          editor.getSelections(),
          [{ range: model.getFullModelRange(), text }],
          () => null
        );
        model.pushStackElement();
      },
      confirmReplace: () =>
        confirm(
          `${name} has changed, and the editor has edits that are neither in the file nor saved.\n\n` +
            'Replace the editor content with the file? (Ctrl+Z in the editor undoes it.)'
        ),
      onLoaded: () =>
        showMessage(
          `Loaded the changes from ${name}. Review them, then click Save to save the flow. Ctrl+Z in the editor undoes them.`,
          MessageBarType.info
        ),
      onDeclined: () =>
        showMessage(
          `Kept your edits; the changes in ${name} weren't loaded. The next Save writes the saved version over the file.`,
          MessageBarType.warning
        ),
      onInvalidJson: () =>
        showMessage(
          `${name} isn't valid JSON, so it wasn't loaded. It's checked again when it changes.`,
          MessageBarType.warning
        ),
      onReadError: (error) =>
        showMessage(
          `Can't read ${name} (${describeError(error)}). Syncing resumes when it's back; if it was moved or deleted, unlink it.`,
          MessageBarType.warning
        ),
      isActive: () => document.visibilityState === 'visible',
      Observer: fileObserver(),
    });
    syncRef.current = sync;
    setLinkedFileState({ name, syncing: true });

    try {
      await sync.start(initial);
      return true;
    } catch (error) {
      sync.stop();
      if (syncRef.current === sync) {
        syncRef.current = null;
      }
      setLinkedFileState({ name, syncing: false });
      showMessage(
        `Couldn't ${initial === 'write' ? 'write to' : 'read'} ${name}: ${describeError(error)}`,
        MessageBarType.error
      );
      return false;
    }
  };

  const reconnect = async () => {
    const handle = handleRef.current;
    if (!handle) {
      return;
    }
    try {
      if (await hasFilePermission(handle, true)) {
        clearMessage();
        await startSync(handle, 'read');
      } else {
        showReconnect(handle.name);
      }
    } catch (error) {
      showMessage(
        `Couldn't reconnect ${handle.name}: ${describeError(error)}`,
        MessageBarType.error
      );
    }
  };

  const remember = async (handle: LinkedFileHandle) => {
    try {
      await setLinkedFile(flowId!, handle);
    } catch (error) {
      showMessage(
        `Linked to ${handle.name}, but the link couldn't be stored, so it ends when this tab closes (${describeError(error)}).`,
        MessageBarType.warning
      );
    }
  };

  // Relink the file stored for this flow once the flow is in the editor.
  useEffect(() => {
    if (!editor || !flowId || !fileSyncSupported()) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const handle = await getLinkedFile(flowId);
        if (cancelled || !handle) {
          return;
        }
        handleRef.current = handle;
        if (await hasFilePermission(handle, false)) {
          if (!cancelled) {
            await startSync(handle, 'read');
          }
        } else if (!cancelled) {
          setLinkedFileState({ name: handle.name, syncing: false });
          showReconnect(handle.name);
        }
      } catch (error) {
        if (!cancelled) {
          showMessage(
            `Couldn't restore the linked file: ${describeError(error)}`,
            MessageBarType.warning
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [editor, flowId]);

  // Checks are skipped while the tab is hidden; catch up when it's shown.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncRef.current?.check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return {
    fileSyncSupported: fileSyncSupported(),
    linkedFile,
    linkNewFile: async () => {
      if (!editor || !flowId) {
        return;
      }
      try {
        const handle = await pickNewFile(suggestedFileName(flowName));
        if (!handle) {
          return;
        }
        if (!(await hasFilePermission(handle, true))) {
          showMessage(
            `The browser didn't allow writing to ${handle.name}.`,
            MessageBarType.warning
          );
          return;
        }
        if (await startSync(handle, 'write')) {
          showMessage(
            `The editor content was written to ${handle.name}. Changes made to the file load here for review; Save writes the saved version back.`,
            MessageBarType.success
          );
          await remember(handle);
        }
      } catch (error) {
        showMessage(
          `Couldn't link a file: ${describeError(error)}`,
          MessageBarType.error
        );
      }
    },
    linkExistingFile: async () => {
      if (!editor || !flowId) {
        return;
      }
      try {
        const handle = await pickExistingFile();
        if (!handle) {
          return;
        }
        handleRef.current = handle;
        await remember(handle);
        // The open picker only grants reading.
        if (await hasFilePermission(handle, true)) {
          if (await startSync(handle, 'read')) {
            showMessage(
              `Linked to ${handle.name}. Changes made to the file load here for review; Save writes the saved version back.`,
              MessageBarType.success
            );
          }
        } else {
          stopSync();
          setLinkedFileState({ name: handle.name, syncing: false });
          showReconnect(handle.name);
        }
      } catch (error) {
        showMessage(
          `Couldn't link a file: ${describeError(error)}`,
          MessageBarType.error
        );
      }
    },
    reconnect,
    unlink: async () => {
      stopSync();
      handleRef.current = null;
      setLinkedFileState(null);
      clearMessage();
      if (flowId) {
        try {
          await deleteLinkedFile(flowId);
        } catch {
          // Nothing to remove.
        }
      }
    },
    /** Runs a save with file checks suspended, so no file change lands mid-save. */
    whilePaused: <T>(fn: () => Promise<T>) =>
      syncRef.current ? syncRef.current.whilePaused(fn) : fn(),
    /** After a successful save, writes the saved version to the linked file. */
    writeSaved: async (savedText: string, submittedText: string) => {
      const sync = syncRef.current;
      const name = handleRef.current?.name;
      if (!sync || !name) {
        return;
      }
      try {
        const result = await sync.writeSaved(savedText, submittedText);
        if (result === 'conflict') {
          showMessage(
            `${name} changed while saving, so the saved version wasn't written to it. Its changes load into the editor for review.`,
            MessageBarType.warning
          );
        }
      } catch (error) {
        showMessage(
          `The flow was saved, but writing it to ${name} failed: ${describeError(error)}`,
          MessageBarType.warning
        );
      }
    },
  };
};

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
