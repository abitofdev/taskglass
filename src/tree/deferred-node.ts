import { ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';

export abstract class DeferredNode {
  protected children: ReadonlyArray<DeferredNode> = [];
  private hasLoadedChildren: boolean = false;

  constructor(
    public readonly type: string,
    public readonly title: string,
    public readonly description: string,
    public readonly tooltip: string
  ) {}

  public async getCachedChildrenAsync(): Promise<DeferredNode[]> {
    if (!this.hasLoadedChildren) {
      this.children = await this.getChildrenAsync();
      this.hasLoadedChildren = true;
    }

    return [...this.children];
  }

  public getTreeItem(): TreeItem {
    const treeItem = new TreeItem(this.title, this.getCollapsibleState());

    treeItem.tooltip = this.tooltip;
    treeItem.description = this.description;
    treeItem.contextValue = this.type;
    treeItem.iconPath = this.getIconPath();
    return treeItem;
  }

  protected abstract getChildrenAsync(): Promise<DeferredNode[]>;

  protected getCollapsibleState(): TreeItemCollapsibleState {
    return this.children.length > 0 || !this.hasLoadedChildren
      ? TreeItemCollapsibleState.Collapsed
      : TreeItemCollapsibleState.None;
  }

  protected getIconPath(): string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon {
    return '';
  }
}
