"""
上朝模拟器 · FastAPI 入口
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as rest_router
from api.ws import ws_router

# 加载 .env（本地开发用）
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动 / 关闭钩子"""
    # 启动：可在此初始化连接池、缓存等
    yield
    # 关闭：清理资源


app = FastAPI(
    title="上朝模拟器 API",
    description="CourtSimulator Backend — 朝会辩论引擎",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS：开发阶段允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
app.include_router(rest_router, prefix="/api")
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "court-simulator-backend"}
