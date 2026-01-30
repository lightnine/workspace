// 文件类型（匹配后端 ObjectType）
export type FileType = 'directory' | 'notebook' | 'python' | 'sql' | 'markdown' | 'config' | 'file';

// 文件/文件夹项（匹配后端 ObjectResponse）
export interface FileItem {
  id: number; // 后端使用 int64 (JuiceFS inode)
  name: string;
  type: FileType;
  path: string;
  parent_id?: number | null;
  size: number;
  description?: string;
  current_version: number;
  creator?: UserResponse;
  tags?: TagResponse[];
  created_at: string;
  updated_at: string;
  children?: FileItem[]; // 前端用于树形结构
  content?: string; // 前端缓存的文件内容
}

// 用户信息（匹配后端 UserResponse）
export interface UserResponse {
  id: string; // UUID
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
}

// 用户信息（前端使用）
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

// 标签页
export interface Tab {
  id: string;
  fileId: number; // 匹配后端的 int64 ID
  fileName: string;
  filePath: string;
  isDirty: boolean; // 未保存状态
  content?: string;
}

// 搜索建议（匹配后端 ObjectResponse）
export interface SearchSuggestion {
  id: number;
  name: string;
  type: FileType;
  path: string;
}

// 最近访问项（前端本地存储）
export interface RecentItem {
  id: string;
  fileId: number;
  fileName: string;
  filePath: string;
  type: FileType;
  lastAccessed: string;
}

// API 响应类型（匹配后端 Response）
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

// 分页响应（匹配后端 PaginatedData）
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// 认证相关类型
export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export interface AuthOutput {
  user: UserResponse;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// 标签响应
export interface TagResponse {
  id: number;
  name: string;
  color?: string;
  created_at: string;
}

// 导航模块类型
export type NavModule =
  | 'workspace'
  | 'recents'
  | 'search'
  | 'compute'
  | 'jobs'
  | 'pipelines'
  | 'sql'
  | 'dashboards'
  | 'experiments';
