import { EventEmitter, ProviderResult, TreeDataProvider, TreeItem, Event } from 'vscode';
import { DeferredNode } from './deferred-node';

export class DeferredTreeDataProvider implements TreeDataProvider<DeferredNode> {
  private _onDidChangeTreeData = new EventEmitter<void>();

  constructor(private _nodes: ReadonlyArray<DeferredNode>) {}

  public getTreeItem(element: DeferredNode): TreeItem {
    return element.getTreeItem();
  }

  public getChildren(element?: DeferredNode): ProviderResult<DeferredNode[]> {
    if (!element) {
      return [...this._nodes];
    }

    return element.getCachedChildrenAsync();
  }

  public refresh(updatedNodes: ReadonlyArray<DeferredNode>): void {
    this._nodes = updatedNodes;
    this._onDidChangeTreeData.fire();
  }

  public get onDidChangeTreeData(): Event<void> {
    return this._onDidChangeTreeData.event;
  }
}
