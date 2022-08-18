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

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      AzureDevOpsPatAuthenticationProvider.id,
      'Azure DevOps',
      new AzureDevOpsPatAuthenticationProvider(context.secrets)
    )
  );

  const devOpsSource = new AzureDevOpsServicesSource('ashleycanham1');
  let treeDataProvider: AzureDevOpsTreeDataProvider;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: false,
      title: 'Loading work items',
    },
    async (progress) => {
      progress.report({ increment: 0 });

      const workItems = await getWorkItems(devOpsSource);
      const workItemsTree = await getWorkItemDetailHierarchy(devOpsSource, workItems);
      treeDataProvider = new AzureDevOpsTreeDataProvider(workItemsTree);

      console.log(context.globalStorageUri);

      context.subscriptions.push(vscode.window.createTreeView('taskSearch', { treeDataProvider }));

      progress.report({ increment: 100 });
    }
  );

  vscode.commands.registerCommand('taskSearch.refreshWorkItems', async () => {
    if (treeDataProvider) {
      const workItems = await getWorkItems(devOpsSource);
      const workItemsTree = await getWorkItemDetailHierarchy(devOpsSource, workItems);
      treeDataProvider.refresh(workItemsTree);
    }
  });

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

async function getWorkItems(source: AzureDevOpsSource): Promise<ReadonlyArray<number>> {
  const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
    createIfNone: true,
  });

  const workItemsUrl = new AzureDevOpsUrlBuilder(source).withTeam('test_agiile').withRoute('_apis/wit/wiql').toString();

  const searchQuery =
    "Select [System.Id], [System.AssignedTo], [System.State], [System.Title], [System.Tags] From WorkItems Where [State] <> 'Closed' AND [State] <> 'Removed' order by [Microsoft.VSTS.Common.Priority] asc, [System.CreatedDate] desc";

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
  ids: ReadonlyArray<number>
): Promise<ReadonlyArray<HierarchicalWorkItem>> {
  const workItems = await getWorkItemDetailFlat(source, ids);

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
  ids: ReadonlyArray<number>
): Promise<ReadonlyArray<WorkItem>> {
  //todo: chunk requests into blocks of 500

  const session = await vscode.authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
    createIfNone: true,
  });

  const url = new AzureDevOpsUrlBuilder(source)
    .withTeam('test_agiile')
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
