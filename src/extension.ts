import 'isomorphic-fetch';
import { authentication, window, commands, env, workspace, ExtensionContext, ProgressLocation } from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from './auth/azuredevops-pat-auth-provider';
import { AzureDevOpsServicesSource } from './azuredevops/sources/azure-devops-services-source';
import { AzureDevOpsSource } from './azuredevops/sources/azure-devops-source';
import { Git } from './git';
import { AzureDevOpsServicesSettings } from './settings/azure-devops-services-settings.interface';
import { AzureDevOpsServerSettings } from './settings/azure-devops-server-settings.interface';
import { AzureDevOpsServerSource } from './azuredevops/sources/azure-devops-server-source';
import { DeferredTreeDataProvider } from './tree/deferred-tree-data-provider';
import { AzureDevOpsSourceNode } from './azuredevops/nodes/azure-devops-source-node';
import { AzureDevOpsWorkNode } from './azuredevops/nodes/azure-devops-work-node';

export async function activate(context: ExtensionContext) {
  context.subscriptions.push(
    authentication.registerAuthenticationProvider(
      AzureDevOpsPatAuthenticationProvider.id,
      'Azure DevOps',
      new AzureDevOpsPatAuthenticationProvider(context.secrets)
    )
  );

  //todo: to use for the images
  console.log(context.globalStorageUri);

  const treeDataProvider = new DeferredTreeDataProvider([]);
  context.subscriptions.push(window.createTreeView('taskglass', { treeDataProvider }));

  refreshWorkItemsAsync(treeDataProvider);

  commands.registerCommand('taskglass.refreshWorkItems', async () => {
    refreshWorkItemsAsync(treeDataProvider);
  });

  commands.registerCommand('taskglass.copyWorkItemId', async (workItem: AzureDevOpsWorkNode) => {
    await env.clipboard.writeText(workItem.id.toString());
  });

  commands.registerCommand('taskglass.associateWorkItemId', async (workItem: AzureDevOpsWorkNode) => {
    const gitExtension = Git.getGitExtension();

    if (!gitExtension) {
      window.showErrorMessage('Git extension is not enabled');
      return;
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      window.showErrorMessage('No workspace folder found');
      return;
    }

    const gitRepository = Git.getRepository(workspaceFolder.uri);
    if (!gitRepository) {
      window.showErrorMessage('No git repository found for active workspace');
      return;
    }

    if (gitRepository.inputBox.value.includes(`#${workItem.id}`)) {
      return;
    }

    if (!gitRepository.inputBox.value.endsWith(' ')) {
      gitRepository.inputBox.value += ' ';
    }

    gitRepository.inputBox.value += `#${workItem.id}`;
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function refreshWorkItemsAsync(treeDataProvider: DeferredTreeDataProvider) {
  const sources = getAzureDevOpsSources();
  if (!sources || sources.length === 0) {
    return;
  }

  await window.withProgress(
    {
      location: ProgressLocation.Window,
      cancellable: false,
      title: 'Loading work items',
    },
    async (progress) => {
      progress.report({ increment: 0 });

      const nodes = sources.map((source) => new AzureDevOpsSourceNode(source));
      treeDataProvider.refresh(nodes);

      progress.report({ increment: 100 });
    }
  );
}

function getAzureDevOpsSources(): AzureDevOpsSource[] {
  const workspaceConfig = workspace.getConfiguration('taskglass');
  const sources: AzureDevOpsSource[] = [];

  const serviceSettings = workspaceConfig.get<AzureDevOpsServicesSettings>('azureDevopsServices');
  if (serviceSettings) {
    sources.push(new AzureDevOpsServicesSource(serviceSettings.organization));
  }

  const serverSettings = workspaceConfig.get<AzureDevOpsServerSettings>('azureDevopsServer2020');
  if (serverSettings) {
    sources.push(
      new AzureDevOpsServerSource(
        serverSettings.scheme,
        serverSettings.instance,
        serverSettings.collection,
        serverSettings.port
      )
    );
  }

  return sources.sort((a, b) => a.name.localeCompare(b.name));
}
