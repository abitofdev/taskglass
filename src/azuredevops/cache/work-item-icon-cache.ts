import { authentication, Uri, workspace } from 'vscode';
import { AzureDevOpsPatAuthenticationProvider } from '../../auth/azuredevops-pat-auth-provider';
import { AzureDevOpsUrlBuilder } from '../azure-devops-url-builder';
import { AzureDevOpsRequestHeaderProvider } from '../providers/azure-devops-request-header-provider';
import { AzureDevOpsSource } from '../sources/azure-devops-source';
import { ExtensionContextProvider } from '../../providers/extension-context-provider';

export class WorkItemIconCache {
  public static iconMap = new Map<string, string>();

  public static async updateIconMapAsync() {
    const iconsDir = this.iconsDir;
    try {
      const allFiles = await workspace.fs.readDirectory(iconsDir);
      for (const [file, _] of allFiles) {
        const fileUri = Uri.joinPath(iconsDir, file);
        const fileData = await workspace.fs.readFile(fileUri);

        const svgContent = Buffer.from(fileData).toString();
        const iconContent = `image/svg+xml;utf8,${svgContent}`;

        this.iconMap.set(file.toString().toLowerCase(), iconContent);
      }
    } catch {
      return;
    }
  }

  public static getIconUri(project: string, type: string): Uri | undefined {
    const iconName = this.getIconFilename(project, type);

    if (!this.iconMap.has(iconName)) {
      return undefined;
    }

    const icon = this.iconMap.get(iconName);

    return Uri.from({
      scheme: 'data',
      path: icon,
    });
  }

  public static async ensureIconCachedAsync(source: AzureDevOpsSource, project: string, type: string): Promise<Uri> {
    const iconsDir = this.iconsDir;
    await workspace.fs.createDirectory(iconsDir);

    const iconPath = Uri.joinPath(iconsDir, this.getIconFilename(project, type));
    const iconAlreadyCached = await this.fileExists(iconPath);

    if (iconAlreadyCached) {
      return iconPath;
    }

    const iconUrl = await this.getWorkItemIconUrlAsync(source, project, type);
    await this.downloadIconAsync(iconUrl, iconPath);
    await this.updateIconMapAsync();

    return iconPath;
  }

  private static async getWorkItemIconUrlAsync(
    source: AzureDevOpsSource,
    project: string,
    type: string
  ): Promise<string> {
    const session = await authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
      createIfNone: true,
    });

    const workItemsUrl = new AzureDevOpsUrlBuilder(source)
      .withProject(project)
      .withRoute('_apis/wit/workitemtypes')
      .withRoute(type)
      .toString();

    const response = await fetch(workItemsUrl, {
      method: 'GET',
      headers: AzureDevOpsRequestHeaderProvider.getHeader(session),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const bodyJson = await response.json();
    return bodyJson.icon.url as string;
  }

  private static async downloadIconAsync(url: string, file: Uri) {
    const session = await authentication.getSession(AzureDevOpsPatAuthenticationProvider.id, [], {
      createIfNone: true,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'image/svg+xml',
        'Content-Type': 'image/svg+xml',
        Authorization: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const svgIcon = await response.text();
    const writeData = Buffer.from(svgIcon, 'utf8');

    await workspace.fs.writeFile(file, writeData);
  }

  private static async fileExists(uri: Uri): Promise<boolean> {
    try {
      await workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private static getIconFilename(project: string, type: string): string {
    return `${project.toLowerCase()}_${type.toLowerCase()}.svg`;
  }

  private static get iconsDir(): Uri {
    return Uri.joinPath(ExtensionContextProvider.instance.globalStorageUri, 'icons');
  }
}
