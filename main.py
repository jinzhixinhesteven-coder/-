# -*- coding: utf-8 -*-
"""
智餐经营 · 后端服务
这个文件是连接前端和 DeepSeek AI 的桥梁。
它做三件事：
  1. 把网页(前端)托管起来，浏览器能打开
  2. 接收前端发来的店铺数据
  3. 调用 DeepSeek，把 AI 的回答流式返回给前端

运行方法见项目根目录的 使用教程.md
"""
import os
import json
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

# 兼容两种启动方式：本地 python main.py，云端 uvicorn backend.main:app
try:
    from skill_prompt import RESTAURANT_ADVISOR_SKILL   # 本地从 backend/ 内运行
except ImportError:
    from backend.skill_prompt import RESTAURANT_ADVISOR_SKILL  # 从项目根运行

# ============ 读取你的 DeepSeek API Key ============
# 优先从环境变量读取（更安全）；没有就读 config.json
def load_api_key():
    key = os.environ.get("DEEPSEEK_API_KEY")
    if key:
        return key
    try:
        with open(os.path.join(os.path.dirname(__file__), "config.json"), "r", encoding="utf-8") as f:
            return json.load(f).get("deepseek_api_key", "")
    except Exception:
        return ""

API_KEY = load_api_key()

# 重要：不在这里创建 OpenAI 客户端。
# 如果在模块加载时就创建，一旦出问题(网络/代理/密钥)，整个服务会启动失败(Render 报 status 1)。
# 改为"用到时才创建"，保证服务总能正常启动、网页总能打开。
_client = None
def get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")
    return _client

app = FastAPI(title="智餐经营")


# ============ AI 诊断接口（流式）============
@app.post("/api/diagnose")
async def diagnose(request: Request):
    """前端把店铺指标数据发来，AI 生成一段经营诊断，流式返回。"""
    body = await request.json()
    store_data = json.dumps(body, ensure_ascii=False)

    def generate():
        if not API_KEY:
            yield "（还没有配置 DeepSeek API Key。请在 backend/config.json 里填入你的 key，或设置环境变量 DEEPSEEK_API_KEY。配置后重启即可使用真实 AI。）"
            return
        try:
            stream = get_client().chat.completions.create(
                model="deepseek-chat",  # 即 DeepSeek-V4-Flash
                messages=[
                    {"role": "system", "content": RESTAURANT_ADVISOR_SKILL},
                    {"role": "user", "content": f"这是我餐厅最近的经营数据，请诊断并给出增收建议：\n{store_data}"},
                ],
                stream=True,
                temperature=0.7,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            yield f"（调用 AI 出错：{e}。请检查 API Key 是否正确、网络是否正常。）"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


# ============ AI 对话接口（流式）============
@app.post("/api/chat")
async def chat(request: Request):
    """前端发来一个问题 + 店铺数据，AI 像顾问一样回答。"""
    body = await request.json()
    question = body.get("question", "")
    store_data = json.dumps(body.get("store", {}), ensure_ascii=False)

    def generate():
        if not API_KEY:
            yield "（还没有配置 DeepSeek API Key，无法回答。请先在 backend/config.json 填入 key 并重启。）"
            return
        try:
            stream = get_client().chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": RESTAURANT_ADVISOR_SKILL},
                    {"role": "user", "content": f"我店的经营数据：{store_data}\n\n我的问题：{question}"},
                ],
                stream=True,
                temperature=0.7,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            yield f"（调用 AI 出错：{e}）"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


# ============ 托管前端网页 ============
# 自动寻找 frontend 文件夹，兼容本地运行和云端部署两种情况。
# 本地：从 backend/ 运行，frontend 在上一层 (../frontend)
# 云端(Render根目录部署)：当前目录就是项目根，frontend 在 ./frontend
_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [
    os.path.join(_HERE, "..", "frontend"),   # backend/ 的上一层
    os.path.join(_HERE, "frontend"),          # backend/ 里面（少见）
    os.path.join(os.getcwd(), "frontend"),    # 当前工作目录下
]
FRONTEND_DIR = next((p for p in _CANDIDATES if os.path.isdir(p)), None)


@app.get("/")
async def index():
    if FRONTEND_DIR:
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
    return {"status": "ok", "msg": "后端运行中，但没找到 frontend 文件夹。请确认部署时包含了 frontend。"}


# 只有找到了 frontend 才挂载静态文件，避免因路径不存在导致启动崩溃(status 1)
if FRONTEND_DIR:
    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    # 本地用 8000；云端(Render)会通过环境变量 PORT 指定端口
    port = int(os.environ.get("PORT", 8000))
    print("=" * 50)
    print("智餐经营 启动中…")
    print(f"前端目录：{FRONTEND_DIR or '（未找到）'}")
    print(f"本地访问： http://127.0.0.1:{port}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=port)
