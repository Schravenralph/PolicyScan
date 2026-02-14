import { BaseApiService } from './BaseApiService';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Authentication API service
 */
export class AuthApiService extends BaseApiService {
  async login(email: string, password: string) {
    return this.request<{
      message: string;
      user: User;
      token: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(name: string, email: string, password: string, role: string) {
    return this.request<{
      message: string;
      user: User;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  async logout() {
    return this.request<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  }
}

