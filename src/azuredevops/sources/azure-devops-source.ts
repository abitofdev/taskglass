import { URL } from 'url';

export abstract class AzureDevOpsSource {
  public abstract readonly apiVersion: string;

  constructor(readonly baseUrl: URL) {}
}
