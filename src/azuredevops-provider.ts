import * as vscode from "vscode";
import { TaskItem } from "./task-item";

export class AzureDevOpsProvider implements vscode.TreeDataProvider<TaskItem> {

    public getTreeItem(element: TaskItem): vscode.TreeItem  {
        return element;
    }

    public getChildren(element?: TaskItem): vscode.ProviderResult<TaskItem[]> {
        
        // vscode.authentication.getSession('microsoft', )
        
        throw new Error("Method not implemented.");
    }
}