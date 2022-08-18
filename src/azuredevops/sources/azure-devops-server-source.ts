import { URL } from 'url';
import { AzureDevOpsSource } from './azure-devops-source';

/**
 * The Azure DevOps data source for self-hosted Azure DevOps instances
 */
export class AzureDevOpsServerSource extends AzureDevOpsSource {
  public readonly apiVersion = '6.0';

  constructor(
    readonly scheme: 'https' | 'http',
    readonly instanceName: string,
    readonly collection: string = 'DefaultCollection',
    readonly port: number = 8080
  ) {
    const url = new URL(`${scheme}://${instanceName}:${port}/${collection}/`);
    super(url);
  }
}
