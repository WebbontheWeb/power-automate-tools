import { DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { FlowBackup } from './flowBackups';

export interface FlowBackupsPanelProps {
  backups: FlowBackup[];
  backupsEnabled: boolean;
  isOpen: boolean;
  onLoad: (backup: FlowBackup) => void;
  onBackupsEnabledChange: (enabled: boolean) => void;
  onDeleteFlowBackups: () => void;
  onDeleteAllBackups: () => void;
  onClose: () => void;
}

export const FlowBackupsPanel: React.FC<FlowBackupsPanelProps> = ({
  backups,
  backupsEnabled,
  isOpen,
  onLoad,
  onBackupsEnabledChange,
  onDeleteFlowBackups,
  onDeleteAllBackups,
  onClose,
}) => {
  return (
    <Panel
      headerText="Backups"
      isOpen={isOpen}
      onDismiss={onClose}
      type={PanelType.medium}
    >
      <Stack tokens={{ childrenGap: 16 }}>
        <Toggle
          label="Back up the server version before each save"
          checked={backupsEnabled}
          onChange={(_, checked) => onBackupsEnabledChange(!!checked)}
        />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Backups are the full flow definition, including any passwords, keys
          or signed URLs typed into actions. They are stored unencrypted in
          this browser profile for up to 14 days (last 10 per flow).
        </MessageBar>
        <Text>
          Loading a backup puts it in the editor; click Save to restore it.
        </Text>
        {backups.length === 0 && <Text>No backups for this flow.</Text>}
        {backups.map((backup) => (
          <Stack
            key={backup.savedAt}
            horizontal
            horizontalAlign="space-between"
            verticalAlign="center"
          >
            <Stack>
              <Text>{new Date(backup.savedAt).toLocaleString()}</Text>
              <Text variant="small">{backup.name}</Text>
            </Stack>
            <DefaultButton text="Load into editor" onClick={() => onLoad(backup)} />
          </Stack>
        ))}
        <Stack horizontal tokens={{ childrenGap: 8 }}>
          <DefaultButton
            text="Delete this flow's backups"
            disabled={backups.length === 0}
            onClick={onDeleteFlowBackups}
          />
          <DefaultButton text="Delete all backups" onClick={onDeleteAllBackups} />
        </Stack>
      </Stack>
    </Panel>
  );
};
