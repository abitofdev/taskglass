import { AzureDevOpsSource } from './azure-devops-source';

/**
 * The Azure DevOps data source for cloud-hosted Azure DevOps instances
 */
export class AzureDevOpsServicesSource extends AzureDevOpsSource {
  public readonly apiVersion = '6.0';

  constructor(readonly organization: string) {
    const url = new URL(`https://dev.azure.com/${organization}/`);
    super(url);
  }

  public get name(): string {
    return this.organization;
  }
}
