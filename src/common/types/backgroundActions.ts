/** Reloads the designer tab if it still shows this flow; responds with whether it did. */
export interface RefreshInitiator {
  type: 'refresh';
  flowId: string;
}

export interface AppLoaded {
  type: 'app-loaded';
}

export interface GetToken {
  type: 'get-token';
}

export interface TokenDetails {
  token: string;
  apiUrl: string;
  legacyApiUrl?: string;
  legacyToken?: string;
}

export interface TokenChanged extends TokenDetails {
  type: 'token-changed';
}

export type Actions = RefreshInitiator | TokenChanged | AppLoaded | GetToken;
