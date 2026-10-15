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
  } = useFlowEditor();

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
        (async () => {
          const savedDefinition = await saveDefinition(editor.getValue());

          if (savedDefinition) {
            editor.setValue(savedDefinition);
          }
        })();
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
  ];

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
