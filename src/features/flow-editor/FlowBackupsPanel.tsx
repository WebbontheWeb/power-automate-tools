import { DefaultButton } from '@fluentui/react/lib/Button';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { FlowBackup } from './flowBackups';

export interface FlowBackupsPanelProps {
  backups: FlowBackup[];
  isOpen: boolean;
  onLoad: (backup: FlowBackup) => void;
  onClose: () => void;
}

export const FlowBackupsPanel: React.FC<FlowBackupsPanelProps> = ({
  backups,
  isOpen,
  onLoad,
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
        <Text>
          The version on the server is backed up before each save. Loading a
          backup puts it in the editor; click Save to restore it.
        </Text>
        {backups.length === 0 && <Text>No backups for this flow yet.</Text>}
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
      </Stack>
    </Panel>
  );
};
