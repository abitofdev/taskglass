import { extensions, Uri } from 'vscode';
import { GitExtension, Repository } from '../typings/git';

export class Git {
  public static getGitExtension(): GitExtension | undefined {
    const vscodeGit = extensions.getExtension<GitExtension>('vscode.git');
    const gitExtension = vscodeGit?.exports;

    if (!gitExtension || !gitExtension?.enabled) {
      return undefined;
    }

    return gitExtension;
  }

  public static getRepository(uri: Uri): Repository | undefined {
    const gitExtension = Git.getGitExtension();

    if (!gitExtension) {
      return undefined;
    }

    return gitExtension.getAPI(1).getRepository(uri) ?? undefined;
  }
}
