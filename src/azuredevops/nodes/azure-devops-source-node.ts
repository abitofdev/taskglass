import { Uri, ThemeIcon, authentication } from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from '../../auth/azuredevops-pat-auth-provider';
import { DeferredNode } from '../../tree/deferred-node';
import { AzureDevOpsUrlBuilder } from '../azure-devops-url-builder';
import { AzureDevOpsRequestHeaderProvider } from '../providers/azure-devops-request-header-provider';
import { AzureDevOpsServerSource } from '../sources/azure-devops-server-source';
import { AzureDevOpsSource } from '../sources/azure-devops-source';
import { AzureDevOpsProjectNode } from './azure-devops-project-node';

export class AzureDevOpsSourceNode extends DeferredNode {
  constructor(private dataSource: AzureDevOpsSource) {
    super('azureDevOpsSource', dataSource.name, '', dataSource.baseUrl.toString());
  }

  public async getChildrenAsync(): Promise<DeferredNode[]> {
    const projects = await this.getProjectsAsync(this.dataSource);
    return projects
      .map((project) => new AzureDevOpsProjectNode(this.dataSource, project))
      .sort((x, y) => x.title.localeCompare(y.title));
  }

  protected override getIconPath(): string | Uri | ThemeIcon | { light: string | Uri; dark: string | Uri } {
    return this.dataSource instanceof AzureDevOpsServerSource ? new ThemeIcon('server') : new ThemeIcon('cloud');
  }

  private async getProjectsAsync(source: AzureDevOpsSource): Promise<ReadonlyArray<string>> {
    const session = await authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
      createIfNone: true,
    });

    const allProjectsUrl = new AzureDevOpsUrlBuilder(source).withRoute('_apis/projects').toString();
    const response = await fetch(allProjectsUrl, {
      method: 'GET',
      headers: AzureDevOpsRequestHeaderProvider.getHeader(session),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const bodyJson = await response.json();
    return (bodyJson.value as any[]).map<string>((x: any) => x.name);
  }
}
