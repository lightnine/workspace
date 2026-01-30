# Databricks Workspace 前端应用

基于 React + TypeScript + Vite + MUI + Monaco Editor 实现的类似 Databricks Workspace 的前端应用。

## 功能特性

- ✅ 导航栏（Sidebar）- 支持多个模块切换
- ✅ 工作区浏览器（Explorer）- 树状文件结构，右键菜单
- ✅ 文件编辑器 - Monaco Editor 集成，语法高亮，自动补全
- ✅ Tab 视图 - 多标签页管理，未保存提示
- ✅ 顶部搜索栏 - 实时搜索建议
- ✅ Dashboard 首页 - 最近访问和快捷入口
- ✅ 用户菜单 - 用户信息和设置
- ✅ 状态管理 - React Context API
- ✅ API 服务层 - 统一错误处理
- ✅ 通知系统 - 成功/失败提示
- ✅ 错误边界 - 错误处理
- ✅ 响应式布局 - 移动端适配

## 技术栈

- **React 19** - UI 框架
- **TypeScript** - 类型支持
- **Vite** - 构建工具
- **Material-UI (MUI)** - UI 组件库
- **Monaco Editor** - 代码编辑器
- **React Router** - 路由管理
- **Axios** - HTTP 请求

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
src/
├── components/        # 可复用组件
│   ├── Sidebar/      # 导航栏
│   ├── Explorer/     # 工作区浏览器
│   ├── Editor/       # Monaco 编辑器
│   ├── SearchBar/    # 搜索栏
│   ├── TabView/      # 标签页视图
│   ├── UserMenu/     # 用户菜单
│   └── common/       # 通用组件
├── pages/            # 页面组件
│   ├── Dashboard/    # 首页
│   ├── Workspace/    # 工作区
│   ├── Recents/      # 最近访问
│   └── Search/       # 搜索页面
├── context/          # React Context 状态管理
├── services/         # API 服务层
├── utils/            # 工具函数
└── types/            # TypeScript 类型定义
```

## 环境变量

创建 `.env` 文件配置 API 基础 URL：

```
VITE_API_BASE_URL=http://localhost:8080/api
```

## 待实现功能

- [ ] 后端 API 集成（等待协议规范）
- [ ] 文件拖拽功能
- [ ] Notebook 单元运行
- [ ] 文件预览和 diff
- [ ] 权限管理 UI
- [ ] 主题切换
- [ ] 其他模块页面（Compute、Jobs、SQL 等）
