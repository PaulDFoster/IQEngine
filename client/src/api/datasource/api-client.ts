import axios from 'axios';
import { DataSourceClient } from './datasource-client';
import { DataSource } from '@/api/Models';
import { TraceabilityOrigin } from '@/utils/sigmfMetadata';
import { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';

export class ApiClient implements DataSourceClient {
  private instance: IPublicClientApplication;
  private account: AccountInfo;

  constructor() {
    const { instance } = useMsal();
    const accounts = instance.getAllAccounts();
    this.instance = instance;
    if (accounts.length > 0) this.account = accounts[0];
    else this.account = null;
  }

  private async getAccessToken() {
    const api_scope = 'api://' + import.meta.env.IQENGINE_APP_ID + '/api';
    if (!this.account) return null;
    try {
      const response = await this.instance.acquireTokenSilent({
        account: this.account,
        scopes: [api_scope],
      });
      return response.accessToken;
    } catch (error) {
      return null;
    }
  }

  private async requestWithAuth(config) {
    const token = await this.getAccessToken();
    if (token != null) {
      const headers = {
        Authorization: `Bearer ${token}`,
      };
      return axios({ ...config, headers });
    }
    return axios({ ...config, headers: {} });
  }

  async sync(account: string, container: string): Promise<void> {
    await this.requestWithAuth({
      method: 'get',
      url: `/api/datasources/${account}/${container}/sync`,
    });
  }
  async query(queryString: string, signal: AbortSignal): Promise<TraceabilityOrigin[]> {
    const response = await this.requestWithAuth({
      method: 'get',
      url: `/api/datasources/query?${queryString}`,
      signal,
    });
    return response.data.map((item, i) => {
      item = Object.assign(new TraceabilityOrigin(), item);
      return item;
    });
  }
  async list(): Promise<DataSource[]> {
    const response = await this.requestWithAuth({
      method: 'get',
      url: '/api/datasources',
    });
    if (response.status !== 200) {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
    if (!response.data) {
      return null;
    }
    return response.data;
  }
  async get(account: string, container: string): Promise<DataSource> {
    const response = await this.requestWithAuth({
      method: 'get',
      url: `/api/datasources/${account}/${container}/datasource`,
    });
    if (response.status !== 200) {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
    if (!response.data) {
      return null;
    }
    return response.data;
  }
  async create(dataSource: DataSource): Promise<DataSource> {
    const response = await this.requestWithAuth({
      method: 'post',
      url: '/api/datasources',
      data: dataSource,
    });
    if (response.status !== 201) {
      throw new Error(`Failed to create datasource: ${response.status}`);
    }
    if (!response.data) {
      return null;
    }
    return response.data;
  }
  features() {
    return {
      updateMeta: true,
      sync: true,
      query: true,
    };
  }
}
