import { AzureDevOpsSource } from './sources/azure-devops-source';

export class AzureDevOpsUrlBuilder {
  private readonly _routeParts: string[] = [];
  private readonly _queryParams: URLSearchParams = new URLSearchParams();

  private _includeApiVersion = true;

  constructor(private readonly _source: AzureDevOpsSource) {}

  public withProject(teamName: string): AzureDevOpsUrlBuilder {
    this._routeParts.unshift(teamName);
    return this;
  }

  public withRoute(route: string): AzureDevOpsUrlBuilder {
    this._routeParts.push(route);
    return this;
  }

  public withQueryParam(key: string, value: string): AzureDevOpsUrlBuilder {
    this._queryParams.append(key, value);
    return this;
  }

  public withoutApiVersion(): AzureDevOpsUrlBuilder {
    this._includeApiVersion = false;
    return this;
  }

  public toString(): string {
    const url = new URL(this._routeParts.join('/'), this._source.baseUrl);

    for (const [name, value] of this._queryParams) {
      url.searchParams.append(name, value);
    }

    if (this._includeApiVersion) {
      url.searchParams.append('api-version', this._source.apiVersion);
    }

    return url.toString();
  }
}
