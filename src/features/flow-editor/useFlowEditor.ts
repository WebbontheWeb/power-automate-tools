import { MessageBarType } from "@fluentui/react/lib/MessageBar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMessageBar } from "../../common/components/Messages";
import {
  ApiError,
  useApiProviderContext,
} from "../../common/providers/ApiProvider";
import { Actions } from "../../common/types/backgroundActions";
import { addFlowBackup, FlowBackup, getFlowBackups } from "./flowBackups";
import { FlowError } from "./types";

const editorSchema = "https://power-automate-tools.local/flow-editor.json#";

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

  const envId = query.get("envId");
  const flowId = query.get("flowId");

  const messageBar = useMessageBar();

  const addMessage = useMemo(
    () => (msg: string | string[], type?: MessageBarType) => {
      messageBar.setMessages([
        {
          key: "1",
          messageBarType: type || MessageBarType.success,
          isMultiline: typeof msg !== "string",
          children: msg,
        },
      ]);
    },
    [messageBar]
  );

  const [data, setData] = useState<{
    name: string;
    definition: string;
    environment: any;
  }>({
    name: "",
    definition: "",
    environment: null,
  });

  // The flow as it was on the server when it was loaded or last saved. Used
  // to detect changes made elsewhere (designer, other users) before saving.
  const baselineRef = useRef<string | null>(null);

  const [backups, setBackups] = useState<FlowBackup[]>([]);

  useEffect(() => {
    (async () => {
      if (envId && flowId) {
        try {
          setIsLoading(true);
          const flow = await api.get(getFlowUrl(flowId));
          baselineRef.current = toEditorJson(flow);
          setData({
            name: flow.properties.displayName,
            environment: flow.properties.environment,
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
      }
    })();
  }, [envId, flowId]);

  return {
    isLoading,
    validationPaneIsOpen,
    setValidationPaneIsOpen,
    validationResult,
    ...messageBar,
    ...data,
    backups,
    loadBackups: async () => {
      if (flowId) {
        setBackups(await getFlowBackups(flowId));
      }
    },
    saveDefinition: async (
      name: string,
      environment: any,
      definition: string
    ) => {
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

        const current = toEditorJson(await api.get(getFlowUrl(flowId)));

        if (
          current !== baselineRef.current &&
          !confirm(
            "This flow has been changed since you opened it here, in the designer or by someone else.\n\n" +
              "Saving will overwrite those changes. The current version will be kept as a backup.\n\n" +
              "Overwrite it?"
          )
        ) {
          addMessage(
            "Nothing was saved. Copy your edits, then reopen the editor to load the latest version.",
            MessageBarType.warning
          );
          return null;
        }

        try {
          await addFlowBackup(flowId!, {
            savedAt: new Date().toISOString(),
            name: name,
            content: current,
          });
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

        const response = await api.patch(getFlowUrl(flowId), {
          properties: {
            displayName: name,
            environment: environment,
            definition: data.definition,
            connectionReferences: data.connectionReferences,
          },
        });

        // Re-read so the baseline matches what a later GET returns.
        try {
          baselineRef.current = toEditorJson(await api.get(getFlowUrl(flowId)));
        } catch {
          baselineRef.current = toEditorJson(response);
        }
        retVal = baselineRef.current;

        // The designer still holds the old version; saving it there would
        // overwrite this change, so reload it.
        chrome.runtime.sendMessage({ type: "refresh" } as Actions);

        addMessage(
          "The flow definition was saved. The previous version is in Backups, and the designer tab was reloaded."
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
  return `powerautomate/flows/${flowId}`;
}

function getLegacyFlowUrl(envId: string | null, flowId: string | null) {
  return `providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}`;
}
