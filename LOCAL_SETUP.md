# 本地 EverMemOS 模式设置指南

本插件已改造为支持 **本地 EverMemOS** 服务，无需云账号即可使用。

## 快速开始

### 1. 启动本地 EverMemOS 服务

```bash
# 在 EverMemOS 项目目录
cd /Volumes/zhitai-2/gitrepo/github/EverMemOS

# 启动基础设施 (MongoDB, Elasticsearch, Milvus, Redis)
docker compose up -d

# 安装依赖并启动服务
uv sync
uv run python src/run.py
```

确认服务运行在 `http://localhost:1995`：

```bash
curl http://localhost:1995/health
# 应返回: {"status": "healthy", ...}
```

### 2. 配置 Claude Code 插件

**无需配置 API Key！** 插件默认连接本地服务。

如果需要显式设置：

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
export EVERMEM_API_URL="http://localhost:1995"
```

### 3. 安装插件

```bash
# 从本地目录安装
claude --plugin-dir /Volumes/zhitai-2/gitrepo/github/evermem-claude-code

# 或添加到 Claude Code 插件市场
claude plugin marketplace add /Volumes/zhitai-2/gitrepo/github/evermem-claude-code
claude plugin install evermem@evermem --scope user
```

### 4. 验证安装

在 Claude Code 中运行：

```
/evermem:help
```

应显示本地模式已连接。

---

## 双模式支持

插件同时支持 **本地模式** 和 **云端模式**：

| 模式 | API URL | 需要 API Key | 说明 |
|------|---------|--------------|------|
| 本地 | `http://localhost:1995` | 否 | 数据存储在本地，完全自主控制 |
| 云端 | `https://api.evermind.ai` | 是 | 使用 EverMind 云服务 |

切换模式：

```bash
# 本地模式（默认）
unset EVERMEM_API_KEY
export EVERMEM_API_URL="http://localhost:1995"

# 云端模式
export EVERMEM_API_KEY="your-api-key"
export EVERMEM_API_URL="https://api.evermind.ai"
```

---

## 使用 Memory Hub

```bash
# 在 Claude Code 中运行
/evermem:hub
```

这会启动本地代理服务器（端口 3456），打开浏览器访问仪表板。

代理服务器会自动检测本地模式并连接 `http://localhost:1995`。

---

## 故障排除

### 连接失败

```bash
# 检查 EverMemOS 是否运行
curl http://localhost:1995/health

# 检查端口
docker ps
```

### 无记忆显示

1. 确保已完成至少一次对话回合
2. 检查 `/tmp/evermem-debug.log` 查看调试信息
3. 短于 3 个词的提示不会被存储

### 切换回云端模式

```bash
export EVERMEM_API_KEY="your-cloud-api-key"
export EVERMEM_API_URL="https://api.evermind.ai"
```

---

## 架构说明

```
Claude Code
    │
    ├── hooks/scripts/inject-memories.js    # 记忆检索
    ├── hooks/scripts/store-memories.js     # 记忆存储
    └── server/proxy.js                     # Dashboard 代理
              │
              ▼
        http://localhost:1995
              │
              ▼
    ┌─────────────────────────────────┐
    │       EverMemOS (本地)           │
    │  ┌─────────┐ ┌─────────┐        │
    │  │ MongoDB │ │  Milvus │        │
    │  └─────────┘ └─────────┘        │
    │  ┌─────────┐ ┌─────────┐        │
    │  │   ES    │ │  Redis  │        │
    │  └─────────┘ └─────────┘        │
    └─────────────────────────────────┘
```
