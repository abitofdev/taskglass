import { ThemeIcon, TreeItemCollapsibleState, Uri } from 'vscode';
import { DeferredNode } from '../../tree/deferred-node';
import { WorkItemIconCache } from '../cache/work-item-icon-cache';
import { WorkItem } from '../work-item.interface';

export class AzureDevOpsWorkNode extends DeferredNode {
  constructor(
    private readonly _project: string,
    private readonly _workItem: WorkItem,
    private readonly _childNodes: AzureDevOpsWorkNode[]
  ) {
    super('azureDevOpsWorkItem', _workItem.title, _workItem.id.toString(), _workItem.state);
  }

  public get id(): number {
    return this._workItem.id;
  }

  protected async getChildrenAsync(): Promise<DeferredNode[]> {
    return Promise.resolve(this._childNodes);
  }

  protected override getCollapsibleState(): TreeItemCollapsibleState {
    return this._childNodes.length > 0 ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
  }

  protected override getIconPath(): string | Uri | ThemeIcon | { light: string | Uri; dark: string | Uri } {
    const iconUri = WorkItemIconCache.getIconUri(this._project, this._workItem.type);
    return iconUri ?? '';
  }
}
