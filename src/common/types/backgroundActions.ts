export interface RefreshInitiator {
  type: 'refresh';
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
