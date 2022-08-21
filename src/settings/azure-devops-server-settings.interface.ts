export interface AzureDevOpsServerSettings {
  scheme: 'https' | 'http';
  instance: string;
  port: number;
  collection: string;
}
