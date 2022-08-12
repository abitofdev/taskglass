import * as vscode from "vscode";

export type TaskType = "work item" | "task" | "bug";

export class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly title: string,
    private _type: TaskType,
    private _description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(title, collapsibleState);
    this.tooltip = `${this._type}-${this.title}`;
    this.description = this._description;
  }
}
