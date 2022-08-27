import { EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Event } from 'vscode';
import { HierarchicalWorkItem } from './azuredevops/hierarchical-work-item.interface';

export class AzureDevOpsTreeDataProvider implements TreeDataProvider<HierarchicalWorkItem> {
  private _onDidChangeTreeData = new EventEmitter<void>();

  constructor(private _workItems: ReadonlyArray<HierarchicalWorkItem>) {}

  public getTreeItem(element: HierarchicalWorkItem): TreeItem {
    const treeItem = new TreeItem(
      element.title,
      element.children.length > 0 ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
    );

    treeItem.tooltip = `${element.type}-${element.title}`;
    treeItem.description = '#' + element.id;
    return treeItem;
  }

  public getChildren(element?: HierarchicalWorkItem): ProviderResult<HierarchicalWorkItem[]> {
    if (!element) {
      return [...this._workItems];
    }

    return element.children;
  }

  public refresh(updatedWorkItems: ReadonlyArray<HierarchicalWorkItem>): void {
    this._workItems = updatedWorkItems;
    this._onDidChangeTreeData.fire();
  }

  public get onDidChangeTreeData(): Event<void> {
    return this._onDidChangeTreeData.event;
  }
}
