import { AuthenticationSession } from "vscode";
import { AzureDevOpsPatAuthenticationProvider } from "./azuredevops-pat-auth-provider";

export class AzureDevOpsPatSession implements AuthenticationSession {
  public readonly account = {
    id: AzureDevOpsPatAuthenticationProvider.id,
    label: "Azure DevOps Personal Access Token",
  };
  public readonly id = AzureDevOpsPatAuthenticationProvider.id;
  public readonly scopes = [];

  /**
   *
   * @param accessToken The personal access token to use for authentication
   */
  constructor(public readonly accessToken: string) {}
}
