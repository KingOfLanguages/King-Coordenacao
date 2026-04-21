// Minimal type declarations for Google Identity Services (GIS)
// https://developers.google.com/identity/oauth2/web/reference/js-reference

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClientConfig {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string; message?: string }) => void
        prompt?: string
      }

      interface TokenClient {
        requestAccessToken(overrideConfig?: { prompt?: string }): void
      }

      interface TokenResponse {
        access_token: string
        token_type: string
        expires_in: number
        scope: string
        error?: string
        error_description?: string
      }

      function initTokenClient(config: TokenClientConfig): TokenClient
      function revoke(accessToken: string, done?: () => void): void
      function hasGrantedAllScopes(
        tokenResponse: TokenResponse,
        ...scopes: string[]
      ): boolean
    }
  }
}
