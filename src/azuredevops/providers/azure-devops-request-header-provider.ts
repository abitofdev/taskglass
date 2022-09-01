import { AuthenticationSession } from 'vscode';

const REQUEST_HEADER_ACCEPT = 'Accept';
const REQUEST_HEADER_CONTENT_TYPE = 'Content-Type';
const REQUEST_HEADER_AUTHORIZATION = 'Authorization';

export abstract class AzureDevOpsRequestHeaderProvider {
  public static getHeader(session: AuthenticationSession): HeadersInit {
    return {
      [REQUEST_HEADER_ACCEPT]: 'application/json',
      [REQUEST_HEADER_CONTENT_TYPE]: 'application/json',
      [REQUEST_HEADER_AUTHORIZATION]: `Basic ${Buffer.from(`:${session.accessToken}`).toString('base64')}`,
    };
  }
}
