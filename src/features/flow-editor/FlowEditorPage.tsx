import {
  CommandBar,
  ICommandBarItemProps
} from '@fluentui/react/lib/CommandBar';
import { MessageBarType } from '@fluentui/react/lib/MessageBar';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useState } from 'react';
import { LoaderModal } from '../../common/components/LoaderModal';
import { Messages } from '../../common/components/Messages';
import { FlowBackupsPanel } from './FlowBackupsPanel';
import { FlowValidationResult } from './FlowValidationResult';
import { useFileSync } from './useFileSync';
import { useFlowEditor } from './useFlowEditor';

const editorContainerClassName = mergeStyles({
  flex: 1,
});

export const FlowEditorPage: React.FC = () => {
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>(
    null as any
  );
  const [backupsPaneIsOpen, setBackupsPaneIsOpen] = useState<boolean>(false);
  const {
    name,
    definition,
    setDefinitionText,
    isLoading,
    saveDefinition,
    validate,
    backups,
    backupsEnabled,
    loadBackups,
    changeBackupsEnabled,
    deleteFlowBackups,
    deleteAllBackups,
    messages,
    setMessages,
    onDismissed,
    validationResult,
    validationPaneIsOpen,
    setValidationPaneIsOpen,
    flowId,
    getBaseline,
  } = useFlowEditor();
  const fileSync = useFileSync({
    flowId,
    flowName: name,
    editor,
    getBaseline,
    setMessages,
  });

  // Rebuilt on every render: the handlers must not hold on to an older
  // saveDefinition/validate (and with it an older API context).
  const commandBarItems: ICommandBarItemProps[] = [
    {
      key: 'name',
      text: name,
    },
    {
      key: 'save',
      text: 'Save',
      iconProps: {
        iconName: 'Edit',
      },
      disabled: !editor,
      onClick: () => {
        // File changes wait until the save (and writing it back) is done.
        fileSync.whilePaused(async () => {
          const submitted = editor.getValue();
          const savedDefinition = await saveDefinition(submitted);

          if (savedDefinition) {
            editor.setValue(savedDefinition);
            await fileSync.writeSaved(savedDefinition, submitted);
          }
        });
      },
    },
    {
      key: 'validate',
      text: 'Validate',
      iconProps: {
        iconName: 'Medical',
      },
      disabled: !editor,
      onClick: () => {
        validate(editor.getValue());
      },
    },
    {
      key: 'backups',
      text: 'Backups',
      iconProps: {
        iconName: 'History',
      },
      onClick: () => {
        loadBackups();
        setBackupsPaneIsOpen(true);
      },
    },
    ...fileCommandBarItems(),
  ];

  function fileCommandBarItems(): ICommandBarItemProps[] {
    if (!fileSync.fileSyncSupported) {
      return [];
    }
    const { linkedFile } = fileSync;
    if (!linkedFile) {
      return [
        {
          key: 'linkFile',
          text: 'Link to file',
          iconProps: { iconName: 'Link' },
          disabled: !editor,
          subMenuProps: {
            items: [
              {
                key: 'newFile',
                text: 'Save to a new file...',
                iconProps: { iconName: 'Save' },
                onClick: () => {
                  fileSync.linkNewFile();
                },
              },
              {
                key: 'existingFile',
                text: 'Link an existing file...',
                iconProps: { iconName: 'OpenFile' },
                onClick: () => {
                  fileSync.linkExistingFile();
                },
              },
            ],
          },
        },
      ];
    }
    return [
      {
        key: 'linkedFile',
        text: linkedFile.syncing
          ? linkedFile.name
          : `${linkedFile.name} (not syncing)`,
        title: linkedFile.syncing
          ? 'Changes to this file load into the editor for review. Save writes the saved version back to it.'
          : 'Click to reconnect the file.',
        iconProps: { iconName: linkedFile.syncing ? 'Sync' : 'Warning' },
        onClick: () => {
          if (!linkedFile.syncing) {
            fileSync.reconnect();
          }
        },
      },
      {
        key: 'unlinkFile',
        text: 'Unlink',
        iconProps: { iconName: 'RemoveLink' },
        onClick: () => {
          fileSync.unlink();
        },
      },
    ];
  }

  return (
    <>
      {isLoading && <LoaderModal />}
      <Messages items={messages} onDismissed={onDismissed} />
      <FlowValidationResult
        errors={validationResult.errors}
        warnings={validationResult.warnings}
        isOpen={validationPaneIsOpen}
        onClose={() => setValidationPaneIsOpen(false)}
      />
      <FlowBackupsPanel
        backups={backups}
        backupsEnabled={backupsEnabled}
        isOpen={backupsPaneIsOpen}
        onClose={() => setBackupsPaneIsOpen(false)}
        onBackupsEnabledChange={changeBackupsEnabled}
        onDeleteFlowBackups={() => {
          if (confirm("Delete all backups of this flow?")) {
            deleteFlowBackups();
          }
        }}
        onDeleteAllBackups={() => {
          if (confirm("Delete the backups of every flow?")) {
            deleteAllBackups();
          }
        }}
        onLoad={(backup) => {
          if (editor) {
            editor.setValue(backup.content);
          } else {
            // The flow didn't load, so the editor isn't mounted yet.
            setDefinitionText(backup.content);
          }
          setBackupsPaneIsOpen(false);
          setMessages([
            {
              key: '1',
              messageBarType: MessageBarType.info,
              children: `Backup from ${new Date(backup.savedAt).toLocaleString()} loaded into the editor. Click Save to restore it.`,
            },
          ]);
        }}
      />
      <CommandBar items={commandBarItems} />
      {!!definition && (
        <div className={editorContainerClassName}>
          <Editor
            defaultValue={definition}
            language="json"
            onMount={(editor) => setEditor(editor)}
          />
        </div>
      )}
    </>
  );
};
