# Cloudflare-ImgBed 后端核心 API 手册

本文档为 `cfbed-gallery` 后续进行 UI 细节打磨、交互增强与新功能（打标、管理、搜索、查看等，明确不包含文件上传）开发时的**核心接口参考手册**。

---

## 一、通用接口与直链规则

- **图片直链规则**：
  - 图床原生直链：`https://<API_BASE>/file/{fileId}`（画廊纯直连图床，严禁中转代理或存储图片）
- **通信与鉴权**：
  - BFF 边缘路由仅负责管理 API 安全代理与鉴权转换（`/api/*`）；
  - 会话通过同源 `HttpOnly` Cookie 自动维持，客户端无密钥泄露风险。

---

## 二、相册列表查询

### 1. 管理端相册列表 (Admin)
- **端点**：`GET /api/manage/list`
- **参数（Query Params）**：
  | 参数 | 类型 | 默认值 | 说明 |
  | :--- | :--- | :--- | :--- |
  | `start` | integer | `0` | 分页起始偏移量（基于 0） |
  | `count` | integer | `50` | 每页数量（推荐 30~50） |
  | `dir` | string | `""` | 目录筛选（例如 `wallpapers/`，根目录传空） |
  | `search` | string | `""` | 文件名不区分大小写模糊匹配 |
  | `fileType` | string | `""` | 媒体类型筛选：`image`, `video`, `audio`, `other` |
  | `includeTags`| string | `""` | 包含的标签（逗号分隔，如 `动漫,壁纸`） |
  | `recursive` | boolean | `false` | 是否递归包含子目录图片 |

- **响应数据格式**：
  ```json
  {
    "files": [
      {
        "name": "1792846950004_6giq.jpg",
        "metadata": {
          "FileName": "photo.jpg",
          "FileType": "image/jpeg",
          "FileSize": "0.15",
          "TimeStamp": 1792846950004,
          "Directory": "wallpapers/",
          "Tags": ["风景", "4K"],
          "Width": 3840,
          "Height": 2160
        }
      }
    ],
    "directories": ["wallpapers/", "anime/"],
    "totalCount": 128,
    "returnedCount": 50
  }
  ```

### 2. 访客公开列表 (Visitor / Readonly)
- **端点**：`GET /api/public/list`
- **说明**：免密只读，数据经后端脱敏（仅包含白名单开放目录与基础文件信息）。
- **参数**：同管理端，但不支持 `includeTags` 复杂打标。

---

## 三、目录树与标签管理

### 1. 目录树获取
- **端点**：`GET /api/directoryTree`
- **响应**：树形目录节点结构，例如：
  ```json
  [
    {
      "name": "wallpapers",
      "path": "wallpapers/",
      "children": []
    }
  ]
  ```

### 2. 标签自动补全 / 现有标签全集
- **端点**：`GET /api/manage/tags/autocomplete`
- **响应**：`{ "tags": ["壁纸", "头像", "摄影", "二次元"] }`

### 3. 为图片应用/更新标签
- **端点**：`POST /api/manage/tags/apply`
- **Request Body (JSON)**：
  ```json
  {
    "fileId": "1792846950004_6giq.jpg",
    "tags": ["二次元", "精选壁纸"]
  }
  ```

---

## 四、图片管理操作 (暂不实现)

### 1. 删除图片
- **单文件删除**：
  - **端点**：`POST /api/manage/delete/{fileId}`
- **批量删除**：
  - **端点**：`POST /api/manage/delete/batch`
  - **Request Body (JSON)**：
    ```json
    { "files": ["file1.jpg", "file2.jpg"] }
    ```

### 2. 移动图片至其他目录
- **端点**：`POST /api/manage/move/{fileId}`
- **Request Body (JSON)**：
  ```json
  { "newPath": "anime/1792846950004_6giq.jpg" }
  ```

### 3. 重命名图片
- **端点**：`POST /api/manage/rename/{fileId}`
- **Request Body (JSON)**：
  ```json
  { "newPath": "wallpaper/new_name.jpg" }
  ```
