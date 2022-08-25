import 'isomorphic-fetch';
import * as vscode from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from './auth/azuredevops-pat-auth-provider';
import { AzureDevOpsTreeDataProvider } from './azuredevops-tree-data-provider';
import { AzureDevOpsUrlBuilder } from './azuredevops/azure-devops-url-builder';
import { HierarchicalWorkItem } from './azuredevops/hierarchical-work-item.interface';
import { AzureDevOpsServicesSource } from './azuredevops/sources/azure-devops-services-source';
import { AzureDevOpsSource } from './azuredevops/sources/azure-devops-source';
import { WorkItemRelation, WorkItemRelationType } from './azuredevops/work-item-relation.interface';
import { WorkItem } from './azuredevops/work-item.interface';
import { Git } from './git';
import { AzureDevOpsServicesSettings } from './settings/azure-devops-services-settings.interface';
import { AzureDevOpsServerSettings } from './settings/azure-devops-server-settings.interface';
import { AzureDevOpsServerSource } from './azuredevops/sources/azure-devops-server-source';

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      AzureDevOpsPatAuthenticationProvider.id,
      'Azure DevOps',
      new AzureDevOpsPatAuthenticationProvider(context.secrets)
    )
  );

  //todo: to use for the images
  console.log(context.globalStorageUri);

  const treeDataProvider = new AzureDevOpsTreeDataProvider([]);
  context.subscriptions.push(vscode.window.createTreeView('taskglass', { treeDataProvider }));

  refreshWorkItemsAsync(treeDataProvider);

  vscode.commands.registerCommand('taskglass.refreshWorkItems', async () => {
    refreshWorkItemsAsync(treeDataProvider);
  });

  vscode.commands.registerCommand('taskglass.copyWorkItemId', async (workItem: WorkItem) => {
    await vscode.env.clipboard.writeText(workItem.id.toString());
  });

  vscode.commands.registerCommand('taskglass.changeProjects', async () => {
    const newProject = await selectProjectAsync();
    if (!newProject) {
      return;
    }

    const workspaceConfig = vscode.workspace.getConfiguration('tasks');
    await workspaceConfig.update('activeProject', newProject, vscode.ConfigurationTarget.Global);
    vscode.commands.executeCommand('taskglass.refreshWorkItems');
  });

  vscode.commands.registerCommand('taskglass.associateWorkItemId', async (workItem: WorkItem) => {
    const gitExtension = Git.getGitExtension();

    if (!gitExtension) {
      vscode.window.showErrorMessage('Git extension is not enabled');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const gitRepository = Git.getRepository(workspaceFolder.uri);
    if (!gitRepository) {
      vscode.window.showErrorMessage('No git repository found for active workspace');
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

async function selectProjectAsync(): Promise<string | undefined> {
  const source = getAzureDevOpsSource();
  if (!source) {
    return undefined;
  }

  const projects = await getProjectsAsync(source);
  const selected = await vscode.window.showQuickPick(projects, { canPickMany: false, title: 'Select a project' });
  return selected;
}

async function refreshWorkItemsAsync(treeDataProvider: AzureDevOpsTreeDataProvider) {
  const source = getAzureDevOpsSource();
  if (!source) {
    return;
  }
  const project = getSavedActiveProject();
  if (!project) {
    vscode.window.showErrorMessage('No active project selected');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: false,
      title: 'Loading work items',
    },
    async (progress) => {
      progress.report({ increment: 0 });

      const workItems = await getWorkItems(source, project);
      const workItemsTree = await getWorkItemDetailHierarchy(source, project, workItems);
      treeDataProvider.refresh(workItemsTree);

      progress.report({ increment: 100 });
    }
  );
}

function getAzureDevOpsSource(): AzureDevOpsSource | undefined {
  const workspaceConfig = vscode.workspace.getConfiguration('taskglass');
  const activeSource = workspaceConfig.get<string>('activeSource');

  switch (activeSource) {
    case 'AzureDevOps Services':
      const serviceSettings = workspaceConfig.get<AzureDevOpsServicesSettings>('azureDevopsServices');
      if (!serviceSettings) {
        vscode.window.showErrorMessage('The Azure DevOps Services settings must be defined');
        return undefined;
      }

      return new AzureDevOpsServicesSource(serviceSettings.organization);
    case 'AzureDevOps Server 2020':
      const serverSettings = workspaceConfig.get<AzureDevOpsServerSettings>('azureDevopsServer2020');
      if (!serverSettings) {
        vscode.window.showErrorMessage('The Azure DevOps Server 2020 settings must be defined');
        return undefined;
      }
      return new AzureDevOpsServerSource(
        serverSettings.scheme,
        serverSettings.instance,
        serverSettings.collection,
        serverSettings.port
      );
  }

  return undefined;
}

function getSavedActiveProject(): string | undefined {
  const workspaceConfig = vscode.workspace.getConfiguration('tasks');
  return workspaceConfig.get<string>('activeProject');
}

async function getProjectsAsync(source: AzureDevOpsSource): Promise<ReadonlyArray<string>> {
  const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
    createIfNone: true,
  });

  const allProjectsUrl = new AzureDevOpsUrlBuilder(source).withRoute('_apis/projects').toString();
  const response = await fetch(allProjectsUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const bodyJson = await response.json();
  return (bodyJson.value as any[]).map<string>((x: any) => x.name);
}

async function getWorkItems(source: AzureDevOpsSource, project: string): Promise<ReadonlyArray<number>> {
  const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
    createIfNone: true,
  });

  const workItemsUrl = new AzureDevOpsUrlBuilder(source).withProject(project).withRoute('_apis/wit/wiql').toString();

  const searchQuery =
    'Select [System.Id], [System.AssignedTo], [System.State], [System.Title], [System.Tags] ' +
    'From WorkItems ' +
    `Where [System.TeamProject] = '${project}' AND [State] <> 'Closed' AND [State] <> 'Removed' ` +
    'order by [Microsoft.VSTS.Common.Priority] asc, [System.CreatedDate] desc';

  const body = JSON.stringify({
    query: searchQuery,
  });

  const response = await fetch(workItemsUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const bodyJson = await response.json();
  return (bodyJson.workItems as any[]).map((x) => Number(x.id));
}

async function getWorkItemDetailHierarchy(
  source: AzureDevOpsSource,
  project: string,
  ids: ReadonlyArray<number>
): Promise<ReadonlyArray<HierarchicalWorkItem>> {
  const workItems = await getWorkItemDetailFlat(source, project, ids);

  const treeWorkItems = workItems.map<HierarchicalWorkItem>((x) => ({ ...x, children: [] }));
  const roots: HierarchicalWorkItem[] = [];
  const workItemIndexMap = new Map<string, number>();

  for (let i = 0; i < treeWorkItems.length; i++) {
    const workItem = treeWorkItems[i];
    workItemIndexMap.set(workItem.url, i);
  }

  for (let i = 0; i < treeWorkItems.length; i++) {
    const workItem = treeWorkItems[i];
    const parent = workItem.relations.find((x) => x.type === 'parent');

    if (!parent) {
      roots.push(workItem);
      continue;
    }

    const parentIndex = workItemIndexMap.get(parent.url);
    if (parentIndex !== undefined) {
      const parentWorkItem = treeWorkItems[parentIndex];
      parentWorkItem.children.push(workItem);
    }
  }

  return roots;
}

async function getWorkItemDetailFlat(
  source: AzureDevOpsSource,
  project: string,
  ids: ReadonlyArray<number>
): Promise<ReadonlyArray<WorkItem>> {
  //todo: chunk requests into blocks of 500

  if (ids.length === 0) {
    return [];
  }

  const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
    createIfNone: true,
  });

  const url = new AzureDevOpsUrlBuilder(source)
    .withProject(project)
    .withRoute('_apis/wit/workitems')
    .withQueryParam('ids', ids.join(','))
    .withQueryParam('$expand', 'relations')
    .toString();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const bodyJson = await response.json();

  const workItems = (bodyJson.value as any[]).map<WorkItem>((x: any) => ({
    id: x.id,
    url: x.url,
    state: x.fields['System.State'],
    type: x.fields['System.WorkItemType'],
    title: x.fields['System.Title'],
    relations: mapRelations(x.relations),
  }));

  return workItems;
}

function mapRelations(relations: any[]): WorkItemRelation[] {
  const isRelation = (item: WorkItemRelation | undefined): item is WorkItemRelation => {
    return !!item;
  };

  if (!relations) {
    return [];
  }

  return relations.map((x) => mapRelation(x)).filter(isRelation);
}

function mapRelation(json: any): WorkItemRelation | undefined {
  let type: WorkItemRelationType;

  switch (json.rel) {
    case 'System.LinkTypes.Hierarchy-Forward':
      type = 'child';
      break;
    case 'System.LinkTypes.Hierarchy-Reverse':
      type = 'parent';
      break;
    default:
      // some other type of relation we don't care about
      return undefined;
  }

  return {
    type,
    url: json.url,
  };
}
