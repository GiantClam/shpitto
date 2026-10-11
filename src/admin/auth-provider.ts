import type {AuthProvider} from 'react-admin';

import {adminRequest} from './http.ts';

type OperatorIdentity = Readonly<{userId: string; role: 'support' | 'operator' | 'superadmin'}>;

export const adminAuthProvider: AuthProvider = {
  async login() { throw new Error('Sign in through the shared account page.'); },
  async logout() {
    await adminRequest('/api/auth/sign-out', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    return '/login';
  },
  async checkAuth() { await adminRequest<OperatorIdentity>('/api/admin/me'); },
  async checkError(error) {
    if (error?.status === 401 || error?.status === 403) throw {redirectTo: '/login', logoutUser: false};
  },
  async getPermissions() { return (await adminRequest<OperatorIdentity>('/api/admin/me')).role; },
  async getIdentity() {
    const result = await adminRequest<OperatorIdentity>('/api/admin/me');
    return {id: result.userId, fullName: result.role};
  },
};
