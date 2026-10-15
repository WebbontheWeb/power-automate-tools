import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Actions, TokenDetails } from '../types/backgroundActions';

export interface IApiProvider {
  get(url: string): Promise<any>;
  patch(url: string, data: any): Promise<any>;
  post(url: string, data: any): Promise<any>;
  legacyPost(url: string, data: any): Promise<any>;
  isApiReady: boolean;
  hasLegacyApi: boolean;
}

interface IApiDetails {
  apiUrl?: string;
  apiToken?: string;
  legacyApiUrl?: string;
  legacyToken?: string;
  isReady: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export const ApiProviderContext = createContext<IApiProvider>({} as any);
export const ApiProviderContextRoot = (): IApiProvider => {
  const [apiDetails, setApiDetails] = useState<IApiDetails>({ isReady: false });
  // Requests read the token from this ref rather than from render state, so a
  // callback captured before a token refresh still sends the current token.
  const apiDetailsRef = useRef(apiDetails);

  const applyTokenDetails = (details: Partial<TokenDetails>) => {
    const prev = apiDetailsRef.current;
    const next: IApiDetails = {
      apiUrl: details.apiUrl || prev.apiUrl,
      apiToken: details.token || prev.apiToken,
      legacyApiUrl: details.legacyApiUrl || prev.legacyApiUrl,
      legacyToken: details.legacyToken || prev.legacyToken,
      isReady: Boolean(details.apiUrl && details.token) || prev.isReady,
    };
    apiDetailsRef.current = next;
    setApiDetails(next);
  };

  // Pull the newest token the background has seen before each request.
  // Pushed updates can be missed while the background worker is asleep.
  const refreshToken = async () => {
    const details = await new Promise<TokenDetails | undefined>((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'get-token' } as Actions,
        (response: TokenDetails | undefined) => {
          // Reading lastError marks it handled; the last token is used instead.
          void chrome.runtime.lastError;
          resolve(response);
        }
      );
    });
    if (details) {
      applyTokenDetails(details);
    }
  };

  const makeRequest = async (
    baseUrl: string,
    token: string,
    apiVersion: string,
    url: string,
    method: string,
    data?: any
  ) => {
    const endpointUrl = baseUrl + url;
    const response = await fetch(
      endpointUrl +
        (endpointUrl.includes('?')
          ? `&api-version=${apiVersion}`
          : `?api-version=${apiVersion}`),
      {
        method: method,
        body: data ? JSON.stringify(data) : undefined,
        headers: {
          authorization: token,
          'Content-Type': 'application/json',
        } as any,
      }
    );

    const text = await response.text();
    let body: any = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Non-JSON body (e.g. an HTML error page); reported via the status below.
    }

    if (response.ok) {
      return body;
    }
    throw new ApiError(
      body?.error?.message || `HTTP ${response.status} ${response.statusText}`,
      response.status
    );
  };

  const http = async (url: string, method: string, data?: any) => {
    await refreshToken();
    const { apiUrl, apiToken } = apiDetailsRef.current;
    return makeRequest(apiUrl!, apiToken!, '1', url, method, data);
  };

  const legacyHttp = async (url: string, method: string, data?: any) => {
    await refreshToken();
    const { legacyApiUrl, legacyToken } = apiDetailsRef.current;
    return makeRequest(legacyApiUrl!, legacyToken!, '2016-11-01', url, method, data);
  };

  useEffect(() => {
    const cb = (action: Actions, sender: any, sendResponse: () => void) => {
      switch (action.type) {
        default:
          break;
        case 'token-changed':
          applyTokenDetails(action);
          break;
      }
      sendResponse();
    };

    chrome.runtime.onMessage.addListener(cb);
    chrome.runtime.sendMessage({ type: 'app-loaded' } as Actions);

    return () => {
      chrome.runtime.onMessage.removeListener(cb);
    };
  }, []);

  return {
    get: (url: string) => http(url, 'GET'),
    patch: (url: string, data: any) => http(url, 'PATCH', data),
    post: (url: string, data: any) => http(url, 'POST', data),
    legacyPost: (url: string, data: any) => legacyHttp(url, 'POST', data),
    isApiReady: apiDetails.isReady,
    hasLegacyApi: Boolean(apiDetails.legacyApiUrl && apiDetails.legacyToken),
  };
};

export const useApiProviderContext = () => useContext(ApiProviderContext);
