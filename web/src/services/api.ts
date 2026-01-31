import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { ApiResponse, FileItem, SearchSuggestion, RecentItem, PaginatedResponse, UserResponse } from '../types';

// Token 管理
const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const getAccessToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setAccessToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setRefreshToken = (token: string): void => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const clearTokens = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: (import.meta.env?.VITE_API_BASE_URL as string) || 'http://localhost:8080',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 添加认证 token
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // 统一错误处理
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as ApiResponse;
      const message = data?.message || error.message;

      // 401 错误，尝试刷新 token
      if (status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // 如果正在刷新，将请求加入队列
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(token => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return apiClient(originalRequest);
            })
            .catch(err => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshTokenValue = getRefreshToken();
        if (!refreshTokenValue) {
          clearTokens();
          processQueue(new Error('未授权，请重新登录'), null);
          // TODO: 跳转到登录页
          return Promise.reject(new Error('未授权，请重新登录'));
        }

        try {
          // 尝试刷新 token
          const { refreshToken: refreshTokenApi } = await import('./auth');
          const authData = await refreshTokenApi(refreshTokenValue);
          setAccessToken(authData.access_token);
          setRefreshToken(authData.refresh_token);

          originalRequest.headers.Authorization = `Bearer ${authData.access_token}`;
          processQueue(null, authData.access_token);
          return apiClient(originalRequest);
        } catch (refreshError) {
          clearTokens();
          processQueue(refreshError, null);
          // TODO: 跳转到登录页
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      switch (status) {
        case 400:
          console.error(`请求错误: ${message}`);
          break;
        case 403:
          console.error('没有权限访问该资源');
          break;
        case 404:
          console.error('资源不存在');
          break;
        case 409:
          console.error(`冲突: ${message}`);
          break;
        case 500:
          console.error('服务器内部错误');
          break;
        default:
          console.error(`请求失败: ${message}`);
      }
    } else if (error.request) {
      console.error('网络错误，请检查网络连接');
    } else {
      console.error('请求配置错误:', error.message);
    }

    return Promise.reject(error);
  }
);

// API 函数

// 对象/文件相关 API

// 获取文件树
export const getFileTree = async (parentId?: number, depth: number = 3): Promise<FileItem[]> => {
  const params: any = { depth };
  if (parentId !== undefined) {
    params.parent_id = parentId;
  }
  const response = await apiClient.get<ApiResponse<FileItem[]>>('/api/v1/objects/tree', { params });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data || [];
};

// 获取对象详情
export const getObjectById = async (id: number): Promise<FileItem> => {
  const response = await apiClient.get<ApiResponse<FileItem>>(`/api/v1/objects/${id}`);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 获取文件内容（二进制转字符串）
export const getFileContent = async (fileId: number): Promise<string> => {
  const response = await apiClient.get(`/api/v1/objects/${fileId}/content`, {
    responseType: 'arraybuffer'
  });
  // 将 ArrayBuffer 转换为字符串
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(response.data));
};

// 保存文件内容
export const saveFileContent = async (fileId: number, content: string, message?: string): Promise<FileItem> => {
  const response = await apiClient.put<ApiResponse<FileItem>>(`/api/v1/objects/${fileId}/content`, {
    content,
    message
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// Notebook Cell 操作类型
export interface CellOperation {
  op: 'add' | 'update' | 'delete' | 'move';
  cell_id?: string;
  index?: number;
  cell?: any;
  old_index?: number;
}

// 增量更新 Notebook（只发送变化的 cells）
export const patchNotebook = async (
  fileId: number, 
  operations: CellOperation[], 
  message?: string
): Promise<FileItem> => {
  const response = await apiClient.patch<ApiResponse<FileItem>>(`/api/v1/objects/${fileId}/notebook`, {
    operations,
    message
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 创建目录
export const createDirectory = async (name: string, parentId?: number, description?: string): Promise<FileItem> => {
  const response = await apiClient.post<ApiResponse<FileItem>>('/api/v1/objects/directories', {
    name,
    parent_id: parentId,
    description
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 创建文件（使用 FormData）
export const createFile = async (
  name: string,
  content: string | File,
  parentId?: number,
  type?: string,
  description?: string
): Promise<FileItem> => {
  const formData = new FormData();
  formData.append('name', name);
  if (parentId !== undefined) {
    formData.append('parent_id', parentId.toString());
  }
  if (type) {
    formData.append('type', type);
  }
  if (description) {
    formData.append('description', description);
  }

  // 处理文件内容
  if (content instanceof File) {
    formData.append('content', content);
  } else {
    // 将字符串转换为 Blob
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append('content', blob, name);
  }

  const response = await apiClient.post<ApiResponse<FileItem>>('/api/v1/objects/files', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 更新对象（重命名等）
export const updateObject = async (id: number, input: { name?: string; description?: string }): Promise<FileItem> => {
  const response = await apiClient.put<ApiResponse<FileItem>>(`/api/v1/objects/${id}`, input);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 删除对象
export const deleteObject = async (id: number): Promise<void> => {
  const response = await apiClient.delete<ApiResponse>(`/api/v1/objects/${id}`);
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};

// 移动对象
export const moveObject = async (id: number, targetParentId?: number, newName?: string): Promise<FileItem> => {
  const response = await apiClient.post<ApiResponse<FileItem>>(`/api/v1/objects/${id}/move`, {
    target_parent_id: targetParentId,
    new_name: newName
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 复制对象
export const copyObject = async (id: number, targetParentId?: number, newName?: string): Promise<FileItem> => {
  const response = await apiClient.post<ApiResponse<FileItem>>(`/api/v1/objects/${id}/copy`, {
    target_parent_id: targetParentId,
    new_name: newName
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 下载文件
export const downloadFile = async (id: number, fileName: string): Promise<void> => {
  const response = await apiClient.get(`/api/v1/objects/${id}/download`, {
    responseType: 'blob'
  });
  
  // 创建下载链接
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// 获取文件下载 URL（用于在新标签页打开）
export const getDownloadUrl = (id: number): string => {
  const baseURL = (import.meta.env?.VITE_API_BASE_URL as string) || 'http://localhost:8080';
  return `${baseURL}/api/v1/objects/${id}/download`;
};

// 获取文件的完整路径 URL（用于复制）
export const getFileUrl = (id: number): string => {
  const baseURL = window.location.origin;
  return `${baseURL}/workspace?fileId=${id}`;
};

// 搜索 API

// 按名称搜索
export const searchByName = async (
  query: string,
  types?: string[],
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<SearchSuggestion>> => {
  const params: any = { q: query, page, page_size: pageSize };
  if (types && types.length > 0) {
    params.type = types;
  }
  const response = await apiClient.get<ApiResponse<PaginatedResponse<SearchSuggestion>>>('/api/v1/search', { params });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 按内容搜索
export const searchByContent = async (
  query: string,
  types?: string[],
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<SearchSuggestion>> => {
  const params: any = { q: query, page, page_size: pageSize };
  if (types && types.length > 0) {
    params.type = types;
  }
  const response = await apiClient.get<ApiResponse<PaginatedResponse<SearchSuggestion>>>('/api/v1/search/content', { params });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 按标签搜索
export const searchByTag = async (tag: string, page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<SearchSuggestion>> => {
  const response = await apiClient.get<ApiResponse<PaginatedResponse<SearchSuggestion>>>('/api/v1/search/tags', {
    params: { tag, page, page_size: pageSize }
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 搜索（简化版，用于搜索栏）
export const search = async (query: string): Promise<SearchSuggestion[]> => {
  const result = await searchByName(query, undefined, 1, 20);
  return result.items;
};

// 最近访问（前端本地存储实现）
const RECENTS_KEY = 'workspace_recents';

export const getRecents = async (): Promise<RecentItem[]> => {
  return new Promise((resolve) => {
    try {
      const stored = localStorage.getItem(RECENTS_KEY);
      if (!stored) {
        resolve([]);
        return;
      }
      resolve(JSON.parse(stored));
    } catch {
      resolve([]);
    }
  });
};

export const addRecent = async (item: Omit<RecentItem, 'id' | 'lastAccessed'>): Promise<void> => {
  try {
    const recents = await getRecents();
    const newItem: RecentItem = {
      ...item,
      id: `recent-${Date.now()}`,
      lastAccessed: new Date().toISOString()
    };
    // 移除重复项
    const filtered = recents.filter((r: RecentItem) => r.fileId !== item.fileId);
    // 添加到开头
    const updated = [newItem, ...filtered].slice(0, 50); // 最多保存50条
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存最近访问失败:', error);
  }
};

// 获取当前 AppID 下的所有用户
export const getUsersByAppId = async (): Promise<UserResponse[]> => {
  const response = await apiClient.get<ApiResponse<UserResponse[]>>('/api/v1/users/app');
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data || [];
};

// 版本历史 API

// 版本信息接口
export interface VersionInfo {
  id: string;
  version_number: number;
  size: number;
  message?: string;
  creator?: {
    id: string;
    email: string;
    username: string;
    display_name?: string;
  };
  created_at: string;
}

// 版本列表响应
export interface VersionListResponse {
  items: VersionInfo[];
  total: number;
  page: number;
  page_size: number;
}

// 获取对象的版本列表
export const getVersionsByObjectId = async (
  objectId: number,
  page: number = 1,
  pageSize: number = 50
): Promise<VersionListResponse> => {
  const response = await apiClient.get<ApiResponse<VersionListResponse>>(
    `/api/v1/versions/objects/${objectId}`,
    { params: { page, page_size: pageSize } }
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data || { items: [], total: 0, page: 1, page_size: pageSize };
};

// 获取特定版本的内容
export const getVersionContent = async (versionId: string): Promise<string> => {
  const response = await apiClient.get(`/api/v1/versions/${versionId}/content`, {
    responseType: 'arraybuffer'
  });
  // 将 ArrayBuffer 转换为字符串
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(response.data));
};

// 恢复到指定版本
export const restoreVersion = async (versionId: string): Promise<FileItem> => {
  const response = await apiClient.post<ApiResponse<FileItem>>(
    `/api/v1/versions/${versionId}/restore`
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

// 获取版本详情
export const getVersionById = async (versionId: string): Promise<VersionInfo> => {
  const response = await apiClient.get<ApiResponse<VersionInfo>>(
    `/api/v1/versions/${versionId}`
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data!;
};

export default apiClient;
