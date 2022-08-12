import 'isomorphic-fetch';
import * as vscode from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from './auth/azuredevops-pat-auth-provider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      AzureDevOpsPatAuthenticationProvider.id,
      'Azure DevOps',
      new AzureDevOpsPatAuthenticationProvider(context.secrets)
    )
  );

  let disposable = vscode.commands.registerCommand(
    'vscode-AzureDevOpsPatAuthenticationProvider-sample.login',
    async () => {
      // Get our PAT session.
      const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
        createIfNone: true,
      });

      try {
        // Make a request to the Azure DevOps API. Keep in mind that this particular API only works with PAT's with
        // 'all organizations' access.
        const req = await fetch('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0', {
          headers: {
            authorization: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
            'content-type': 'application/json',
          },
        });
        if (!req.ok) {
          throw new Error(req.statusText);
        }
        const res = (await req.json()) as { displayName: string };
        vscode.window.showInformationMessage(`Hello ${res.displayName}`);
      } catch (e: any) {
        if (e.message === 'Unauthorized') {
          vscode.window.showErrorMessage(
            'Failed to get profile. You need to use a PAT that has access to all organizations. Please sign out and try again.'
          );
        }
        throw e;
      }
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
