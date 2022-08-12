import {
  authentication,
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationSession,
  Disposable,
  Event,
  EventEmitter,
  SecretStorage,
  window,
} from "vscode";
import { AzureDevOpsPatSession } from "./azuredevops-pat-session";

export class AzureDevOpsPatAuthenticationProvider implements AuthenticationProvider, Disposable {
  static id = "AzureDevOpsPAT";
  private static secretKey = "AzureDevOpsPAT";

  private _currentToken?: Promise<string | undefined>;
  private _dispose?: Disposable;

  private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this._onDidChangeSessions.event;
  }

  constructor(private readonly secretStorage: SecretStorage) {}

  // This function is called first when `vscode.authentication.getSessions` is called.
  public async getSessions(_scopes?: readonly string[] | undefined): Promise<readonly AuthenticationSession[]> {
    this.ensureInitialized();
    const token = await this.cacheTokenFromStorage();
    return token ? [new AzureDevOpsPatSession(token)] : [];
  }

  // This function is called after `this.getSessions` is called and only when:
  // - `this.getSessions` returns nothing but `createIfNone` was set to `true` in `vscode.authentication.getSessions`
  // - `vscode.authentication.getSessions` was called with `forceNewSession: true`
  // - The end user initiates the "silent" auth flow via the Accounts menu
  public async createSession(_scopes: readonly string[]): Promise<AuthenticationSession> {
    this.ensureInitialized();

    // Prompt for the PAT.
    const token = await window.showInputBox({
      ignoreFocusOut: true,
      placeHolder: "Personal access token",
      prompt: "Enter an Azure DevOps Personal Access Token (PAT).",
      password: true,
    });

    // Note: this example doesn't do any validation of the token beyond making sure it's not empty.
    if (!token) {
      throw new Error("PAT is required");
    }

    // Don't set `currentToken` here, since we want to fire the proper events in the `checkForUpdates` call
    await this.secretStorage.store(AzureDevOpsPatAuthenticationProvider.secretKey, token);
    console.log("Successfully logged in to Azure DevOps");

    return new AzureDevOpsPatSession(token);
  }

  public async removeSession(_sessionId: string): Promise<void> {
    await this.secretStorage.delete(AzureDevOpsPatAuthenticationProvider.secretKey);
  }

  private ensureInitialized(): void {
    if (this._dispose === undefined) {
      void this.cacheTokenFromStorage();

      this._dispose = Disposable.from(
        // This onDidChange event happens when the secret storage changes in _any window_ since
        // secrets are shared across all open windows.
        this.secretStorage.onDidChange((e) => {
          if (e.key === AzureDevOpsPatAuthenticationProvider.secretKey) {
            void this.checkForUpdates();
          }
        }),
        // This fires when the user initiates a "silent" auth flow via the Accounts menu.
        authentication.onDidChangeSessions((e) => {
          if (e.provider.id === AzureDevOpsPatAuthenticationProvider.id) {
            void this.checkForUpdates();
          }
        })
      );
    }
  }

  // This is a crucial function that handles whether or not the token has changed in
  // a different window of VS Code and sends the necessary event if it has.
  private async checkForUpdates(): Promise<void> {
    const added: AuthenticationSession[] = [];
    const removed: AuthenticationSession[] = [];
    const changed: AuthenticationSession[] = [];

    const previousToken = await this._currentToken;
    const session = (await this.getSessions())[0];

    if (session?.accessToken && !previousToken) {
      added.push(session);
    } else if (!session?.accessToken && previousToken) {
      removed.push(session);
    } else if (session?.accessToken !== previousToken) {
      changed.push(session);
    } else {
      return;
    }

    void this.cacheTokenFromStorage();
    this._onDidChangeSessions.fire({ added: added, removed: removed, changed: changed });
  }

  private cacheTokenFromStorage(): Promise<string | undefined> {
    this._currentToken = this.secretStorage.get(AzureDevOpsPatAuthenticationProvider.secretKey) as Promise<
      string | undefined
    >;
    return this._currentToken;
  }

  public dispose(): void {
    this._dispose?.dispose();
  }
}
