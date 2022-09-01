import { firstValueFrom, forkJoin } from 'rxjs';
import { authentication } from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from '../../auth/azuredevops-pat-auth-provider';
import { DeferredNode } from '../../tree/deferred-node';
import { AzureDevOpsUrlBuilder } from '../azure-devops-url-builder';
import { AzureDevOpsRequestHeaderProvider } from '../providers/azure-devops-request-header-provider';
import { AzureDevOpsSource } from '../sources/azure-devops-source';
import { WorkItemRelation, WorkItemRelationType } from '../work-item-relation.interface';
import { WorkItem } from '../work-item.interface';
import { AzureDevOpsWorkNode } from './azure-devops-work-node';

export class AzureDevOpsProjectNode extends DeferredNode {
  constructor(private readonly _source: AzureDevOpsSource, private readonly _project: string) {
    super('azureDevOpsProject', _project, '', '');
  }

  protected async getChildrenAsync(): Promise<DeferredNode[]> {
    const workItemIds = await this.getWorkItemIdsAsync();
    const hierarchy = await this.getWorkItemDetailHierarchyAsync(workItemIds);

    return Promise.resolve([...hierarchy]);
  }

  private async getWorkItemIdsAsync(): Promise<ReadonlyArray<number>> {
    const session = await authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
      createIfNone: true,
    });

    const workItemsUrl = new AzureDevOpsUrlBuilder(this._source)
      .withProject(this._project)
      .withRoute('_apis/wit/wiql')
      .toString();

    const searchQuery =
      'Select [System.Id], [System.AssignedTo], [System.State], [System.Title], [System.Tags] ' +
      'From WorkItems ' +
      `Where [System.TeamProject] = '${this._project}' AND [State] <> 'Closed' AND [State] <> 'Removed' ` +
      'order by [Microsoft.VSTS.Common.Priority] asc, [System.CreatedDate] desc';

    const body = JSON.stringify({
      query: searchQuery,
    });

    const response = await fetch(workItemsUrl, {
      method: 'POST',
      headers: AzureDevOpsRequestHeaderProvider.getHeader(session),
      body,
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const bodyJson = await response.json();
    return (bodyJson.workItems as any[]).map((x) => Number(x.id));
  }

  private async getWorkItemDetailHierarchyAsync(
    ids: ReadonlyArray<number>
  ): Promise<ReadonlyArray<AzureDevOpsWorkNode>> {
    const workItems = await this.getWorkItemDetailFlatAsync(ids);

    type WorkItemWithChildren = { children: WorkItemWithChildren[] } & WorkItem;

    const treeWorkItems = workItems.map<WorkItemWithChildren>((x) => ({ ...x, children: [] }));
    const roots: WorkItemWithChildren[] = [];
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

    // Map tree structure to AzureDevOpsWorkNode
    const mapWorkItem = (workItem: WorkItemWithChildren): AzureDevOpsWorkNode => {
      if (workItem.children.length === 0) {
        return new AzureDevOpsWorkNode(workItem, []);
      }

      const children = workItem.children
        .map((workItem) => mapWorkItem(workItem))
        .filter((x): x is AzureDevOpsWorkNode => !!x);

      return new AzureDevOpsWorkNode(workItem, children);
    };

    return roots.map((x) => mapWorkItem(x));
  }

  private async getWorkItemDetailFlatAsync(ids: ReadonlyArray<number>): Promise<ReadonlyArray<WorkItem>> {
    if (ids.length === 0) {
      return [];
    }

    const session = await authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
      createIfNone: true,
    });

    // Chunk ids so that each request has a maximum of 500 ids (limit of Azure DevOps Api)
    let urlBuilders = [...this.chunk(ids, 500)].map((chunk) =>
      new AzureDevOpsUrlBuilder(this._source)
        .withProject(this._project)
        .withRoute('_apis/wit/workitems')
        .withQueryParam('ids', chunk.join(','))
        .withQueryParam('$expand', 'relations')
    );

    // Ensure that each url is under the max allowed character limit
    const maxUrlLength = 2000;
    while (Math.max(...urlBuilders.map((u) => u.length)) > maxUrlLength) {
      const newUrlBuilders: AzureDevOpsUrlBuilder[] = [];
      for (const urlBuilder of urlBuilders) {
        if (urlBuilder.length <= maxUrlLength) {
          newUrlBuilders.push(urlBuilder);
          continue;
        }

        const idsQueryString = urlBuilder.getQueryParam('ids');

        if (idsQueryString === null) {
          throw new Error('ids query string returned null');
        }

        const ids = idsQueryString?.split(',');
        const half = Math.ceil(ids.length / 2);

        const firstIdsSet = ids.slice(0, half);
        const secondIdsSet = ids.slice(half);

        newUrlBuilders.push(
          new AzureDevOpsUrlBuilder(this._source)
            .withProject(this._project)
            .withRoute('_apis/wit/workitems')
            .withQueryParam('ids', firstIdsSet.join(','))
            .withQueryParam('$expand', 'relations'),
          new AzureDevOpsUrlBuilder(this._source)
            .withProject(this._project)
            .withRoute('_apis/wit/workitems')
            .withQueryParam('ids', secondIdsSet.join(','))
            .withQueryParam('$expand', 'relations')
        );
      }

      urlBuilders = newUrlBuilders;
    }

    // Make the request
    const urls = urlBuilders.map((u) => u.toString());
    const requests = urls.map((url) =>
      fetch(url, {
        method: 'GET',
        headers: AzureDevOpsRequestHeaderProvider.getHeader(session),
      })
    );

    const responses = await firstValueFrom(forkJoin(requests));
    const workItems: WorkItem[] = [];

    for (const response of responses) {
      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const bodyJson = await response.json();
      const responseItems = (bodyJson.value as any[]).map<WorkItem>((x: any) => ({
        id: x.id,
        url: x.url,
        state: x.fields['System.State'],
        type: x.fields['System.WorkItemType'],
        title: x.fields['System.Title'],
        relations: this.mapRelations(x.relations),
      }));

      workItems.push(...responseItems);
    }

    return workItems;
  }

  private *chunk<T>(source: ReadonlyArray<T>, size: number): Generator<T[], void> {
    for (let i = 0; i < source.length; i += size) {
      yield source.slice(i, i + size);
    }
  }

  private mapRelations(relations: any[]): WorkItemRelation[] {
    const isRelation = (item: WorkItemRelation | undefined): item is WorkItemRelation => {
      return !!item;
    };

    if (!relations) {
      return [];
    }

    return relations.map((x) => this.mapRelation(x)).filter(isRelation);
  }

  private mapRelation(json: any): WorkItemRelation | undefined {
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
}
