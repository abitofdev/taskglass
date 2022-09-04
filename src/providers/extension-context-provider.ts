import { ExtensionContext } from 'vscode';

export class ExtensionContextProvider {
  private static _instance: ExtensionContext;

  constructor(context: ExtensionContext) {
    ExtensionContextProvider._instance = context;
  }

  public static get instance(): ExtensionContext {
    return this._instance;
  }
}
