import apiClient from './api';
import { ApiResponse, LoginInput, RegisterInput, AuthOutput, UserResponse } from '../types';

// 认证相关 API

// 注册
export const register = async (input: RegisterInput): Promise<AuthOutput> => {
  const response = await apiClient.post<ApiResponse<AuthOutput>>('/api/v1/auth/register', input);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 登录
export const login = async (input: LoginInput): Promise<AuthOutput> => {
  const response = await apiClient.post<ApiResponse<AuthOutput>>('/api/v1/auth/login', input);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 刷新 Token
export const refreshToken = async (refreshToken: string): Promise<AuthOutput> => {
  const response = await apiClient.post<ApiResponse<AuthOutput>>('/api/v1/auth/refresh', {
    refresh_token: refreshToken
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 登出
export const logout = async (): Promise<void> => {
  await apiClient.post<ApiResponse>('/api/v1/auth/logout');
};

// 获取当前用户信息
export const getCurrentUser = async (): Promise<UserResponse> => {
  const response = await apiClient.get<ApiResponse<UserResponse>>('/api/v1/users/me');
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 更新当前用户信息
export const updateCurrentUser = async (input: { display_name?: string; avatar_url?: string }): Promise<UserResponse> => {
  const response = await apiClient.put<ApiResponse<UserResponse>>('/api/v1/users/me', input);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 修改密码
export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  const response = await apiClient.put<ApiResponse>('/api/v1/users/me/password', {
    old_password: oldPassword,
    new_password: newPassword
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};
