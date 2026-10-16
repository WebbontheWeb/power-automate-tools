import { MessageBarButton } from "@fluentui/react/lib/Button";
import { MessageBarType } from "@fluentui/react/lib/MessageBar";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useMessageBar } from "../../common/components/Messages";
import {
  ApiError,
  useApiProviderContext,
} from "../../common/providers/ApiProvider";
import { Actions } from "../../common/types/backgroundActions";
import {
  addFlowBackup,
  deleteAllBackups,
  deleteFlowBackups,
  FlowBackup,
  getBackupsEnabled,
  getFlowBackups,
  setBackupsEnabled,
} from "./flowBackups";
import { FlowError } from "./types";

const editorSchema = "https://power-automate-tools.local/flow-editor.json#";

const envIdPattern = /^[A-Za-z0-9-]+$/;
const flowIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const useFlowEditor = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [validationPaneIsOpen, setValidationPaneIsOpen] =
    useState<boolean>(false);

  const [validationResult, setValidationResult] = useState<{
    errors: FlowError[];
    warnings: FlowError[];
  }>({ errors: [], warnings: [] });

  const api = useApiProviderContext();
  const query = new URLSearchParams(location.search);

  const envId = validId(query.get("envId"), envIdPattern);
  const flowId = validId(query.get("flowId"), flowIdPattern);

  const messageBar = useMessageBar();

  const addMessage = useMemo(
    () =>
      (
        msg: string | string[],
        type?: MessageBarType,
        actions?: JSX.Element
      ) => {
        messageBar.setMessages([
          {
            key: "1",
            messageBarType: type || MessageBarType.success,
            isMultiline: typeof msg !== "string",
            children: msg,
            actions,
          },
        ]);
      },
    [messageBar]
  );

  const [data, setData] = useState<{
    name: string;
    definition: string;
  }>({
    name: "",
    definition: "",
  });

  // The flow as it was on the server when it was loaded or last saved. Used
  // to detect changes made elsewhere (designer, other users) before saving.
  // Null when the flow couldn't be loaded.
  const baselineRef = useRef<string | null>(null);

  const [backups, setBackups] = useState<FlowBackup[]>([]);
  const [backupsEnabled, setBackupsEnabledState] = useState<boolean>(true);

  useEffect(() => {
    getBackupsEnabled().then(setBackupsEnabledState);
  }, []);

  useEffect(() => {
    (async () => {
      if (!envId || !flowId) {
        addMessage(
          "The flow or environment ID in the address is missing or invalid. Open the editor from the flow's page.",
          MessageBarType.error
        );
        return;
      }
      try {
        setIsLoading(true);
        const flow = await api.get(getFlowUrl(flowId));
        baselineRef.current = toEditorJson(flow);
        setData({
          name: flow.properties.displayName,
          definition: baselineRef.current,
        });
      } catch (error) {
        addMessage(
          "Error during fetching the flow definition: " + describeError(error),
          MessageBarType.error
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [envId, flowId]);

  const reloadDesigner = async () => {
    const reloaded = await sendMessage<boolean>({
      type: "refresh",
      flowId: flowId!,
    });
    addMessage(
      reloaded
        ? "The designer tab was reloaded with the saved version."
        : "The designer tab wasn't reloaded: it's closed or showing a different page.",
      reloaded ? MessageBarType.success : MessageBarType.warning
    );
  };

  return {
    isLoading,
    validationPaneIsOpen,
    setValidationPaneIsOpen,
    validationResult,
    ...messageBar,
    ...data,
    flowId,
    /** The flow as on the server when last loaded or saved. */
    getBaseline: () => baselineRef.current,
    /** Shows text in the editor when it isn't mounted (the flow didn't load). */
    setDefinitionText: (definition: string) =>
      setData((prev) => ({ ...prev, definition })),
    backups,
    backupsEnabled,
    loadBackups: async () => {
      if (flowId) {
        setBackups(await getFlowBackups(flowId));
      }
    },
    changeBackupsEnabled: async (enabled: boolean) => {
      setBackupsEnabledState(enabled);
      await setBackupsEnabled(enabled);
    },
    deleteFlowBackups: async () => {
      if (flowId) {
        await deleteFlowBackups(flowId);
        setBackups([]);
      }
    },
    deleteAllBackups: async () => {
      await deleteAllBackups();
      setBackups([]);
    },
    saveDefinition: async (definition: string) => {
      if (!flowId) {
        return null;
      }

      let retVal: string | null = null;
      let data: any;
      try {
        data = JSON.parse(definition);
      } catch (error) {
        addMessage(
          "The JSON is not valid, nothing was saved: " + describeError(error),
          MessageBarType.error
        );
        return null;
      }

      if (!data.definition) {
        addMessage('Missing "definition" flow property', MessageBarType.error);
        return null;
      }

      if (!data.connectionReferences) {
        addMessage(
          'Missing "connectionReferences" flow property',
          MessageBarType.error
        );
        return null;
      }

      try {
        setIsLoading(true);

        const currentFlow = await api.get(getFlowUrl(flowId));
        const current = toEditorJson(currentFlow);

        if (baselineRef.current === null) {
          if (
            !confirm(
              "The editor never loaded this flow's current version, so saving will replace whatever is on the server.\n\n" +
                "Save anyway?"
            )
          ) {
            addMessage("Nothing was saved.", MessageBarType.warning);
            return null;
          }
        } else if (
          current !== baselineRef.current &&
          !confirm(
            "This flow has been changed since you opened it here, in the designer or by someone else.\n\n" +
              "Saving will overwrite those changes" +
              (backupsEnabled
                ? ". The current version will be kept as a backup."
                : ", and backups are turned off.") +
              "\n\nOverwrite it?"
          )
        ) {
          addMessage(
            "Nothing was saved. Copy your edits, then reopen the editor to load the latest version.",
            MessageBarType.warning
          );
          return null;
        }

        let backedUp = false;
        if (backupsEnabled) {
          try {
            await addFlowBackup(flowId, {
              savedAt: new Date().toISOString(),
              name: currentFlow.properties.displayName,
              content: current,
            });
            backedUp = true;
          } catch (error) {
            if (
              !confirm(
                "A backup of the current version couldn't be stored (" +
                  describeError(error) +
                  ").\n\nSave without a backup?"
              )
            ) {
              addMessage("Nothing was saved.", MessageBarType.warning);
              return null;
            }
          }
        }

        // Name and environment come from the fresh read, so a rename made
        // elsewhere since the editor opened isn't reverted.
        const response = await api.patch(getFlowUrl(flowId), {
          properties: {
            displayName: currentFlow.properties.displayName,
            environment: currentFlow.properties.environment,
            definition: data.definition,
            connectionReferences: data.connectionReferences,
          },
        });

        // Re-read so the baseline matches what a later GET returns.
        let savedFlow = response;
        try {
          savedFlow = await api.get(getFlowUrl(flowId));
        } catch {
          // Fall back to the PATCH response.
        }
        baselineRef.current = toEditorJson(savedFlow);
        retVal = baselineRef.current;
        setData({
          name: savedFlow.properties.displayName,
          definition: retVal,
        });

        // The designer still holds the old version, and saving there would
        // overwrite this change. Reloading it could discard unsaved designer
        // work, so leave that to the user.
        addMessage(
          "The flow definition was saved" +
            (backedUp ? " and the previous version is in Backups" : "") +
            ". Reload the designer tab before editing there, or it may save the old version over this one.",
          MessageBarType.success,
          createElement(MessageBarButton, {
            text: "Reload designer",
            onClick: () => {
              reloadDesigner();
            },
          })
        );
      } catch (error) {
        addMessage(
          "Error during saving the flow definition: " + describeError(error),
          MessageBarType.error
        );
      } finally {
        setIsLoading(false);
      }

      return retVal;
    },
    validate: async (definition: string) => {
      if (!api.hasLegacyApi) {
        addMessage(
          "Validation is not available yet. Please open a flow in the Power Automate designer first to enable the legacy API endpoint, then try again.",
          MessageBarType.warning
        );
        return;
      }

      try {
        setIsLoading(true);
        const legacyFlowUrl = getLegacyFlowUrl(envId, flowId);
        const errors: FlowError[] = await api.legacyPost(
          `${legacyFlowUrl}/checkFlowErrors`,
          {
            properties: {
              definition: JSON.parse(definition).definition,
            },
          }
        );

        const warnings: FlowError[] = await api.legacyPost(
          `${legacyFlowUrl}/checkFlowWarnings`,
          {
            properties: {
              definition: JSON.parse(definition).definition,
            },
          }
        );
        setValidationResult({ warnings, errors });
        setValidationPaneIsOpen(true);
      } catch (error) {
        addMessage(
          "Error during validation of the flow definition: " +
            describeError(error),
          MessageBarType.error
        );
      } finally {
        setIsLoading(false);
      }
    },
  };
};

function validId(value: string | null, pattern: RegExp) {
  return value && pattern.test(value) ? value : null;
}

function sendMessage<T>(action: Actions) {
  return new Promise<T | undefined>((resolve) => {
    chrome.runtime.sendMessage(action, (response: T | undefined) => {
      void chrome.runtime.lastError;
      resolve(response);
    });
  });
}

function toEditorJson(flow: any) {
  return JSON.stringify(
    {
      $schema: editorSchema,
      connectionReferences: flow.properties.connectionReferences,
      definition: flow.properties.definition,
    },
    null,
    2
  );
}

function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return "your Power Automate session token has expired. Reload the flow's designer tab, then try again. Your edits here are kept.";
  }
  return error instanceof Error ? error.message : String(error);
}

function getFlowUrl(flowId: string | null) {
  return `powerautomate/flows/${encodeURIComponent(flowId ?? "")}`;
}

function getLegacyFlowUrl(envId: string | null, flowId: string | null) {
  return `providers/Microsoft.ProcessSimple/environments/${encodeURIComponent(
    envId ?? ""
  )}/flows/${encodeURIComponent(flowId ?? "")}`;
}
