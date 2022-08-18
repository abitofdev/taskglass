import * as vscode from 'vscode';
import { HierarchicalWorkItem } from './azuredevops/hierarchical-work-item.interface';

export class AzureDevOpsTreeDataProvider implements vscode.TreeDataProvider<HierarchicalWorkItem> {
  constructor(private readonly _workItems: ReadonlyArray<HierarchicalWorkItem>) {}

  public getTreeItem(element: HierarchicalWorkItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.title,
      element.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    treeItem.tooltip = `${element.type}-${element.title}`;
    treeItem.description =  '#' + element.id;
    return treeItem;
  }

  public getChildren(element?: HierarchicalWorkItem): vscode.ProviderResult<HierarchicalWorkItem[]> {
    if (!element) {
      return [...this._workItems];
    }

    return element.children;
  }
}
