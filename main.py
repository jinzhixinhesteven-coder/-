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
                    {"role": "user", "content": f"这是我餐厅最近的经营数据，请按手册的【输出格式】A 给出经营诊断：\n{store_data}"},
                ],
                stream=True,
                temperature=0.4,  # 低温度让数字判断更稳定一致
                max_tokens=1200,  # 手册已限制 450 字内；这里只是兜底，防止句子被截断
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
    """前端发来：问题 + 最近对话历史 + 最近一次诊断摘要 + 店铺数据。
    AI 带着记忆回答——不会重复已经说过的建议，也不会把诊断再讲一遍。"""
    body = await request.json()
    question = body.get("question", "")
    store_data = json.dumps(body.get("store", {}), ensure_ascii=False)
    history = body.get("history", [])           # [{role:'user'|'assistant', content:'...'}]
    last_diag = str(body.get("last_diagnosis", "") or "")[:800]

    # 组装多轮对话：先给店况（+诊断摘要），再接最近的对话历史，最后是新问题
    context = f"我店的经营数据：{store_data}"
    if last_diag:
        context += f"\n\n【AI 诊断页已经给过的诊断摘要】\n{last_diag}\n（以上内容我已经看过了，对话中不要原样重复；问到相关话题时直接给下一步或新角度。）"
    messages = [
        {"role": "system", "content": RESTAURANT_ADVISOR_SKILL},
        {"role": "user", "content": context},
        {"role": "assistant", "content": "收到，门店情况我已掌握。请讲。"},
    ]
    for h in history[-8:]:
        role, content = h.get("role"), str(h.get("content", ""))[:800]
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    def generate():
        if not API_KEY:
            yield "（还没有配置 DeepSeek API Key，无法回答。请先在 backend/config.json 填入 key 并重启。）"
            return
        try:
            stream = get_client().chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                stream=True,
                temperature=0.4,  # 低温度让数字判断更稳定一致
                max_tokens=600,   # 手册已限制 200 字内；这里只是兜底
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            yield f"（调用 AI 出错：{e}）"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


# ============ 托管前端网页 ============
# 自动寻找前端文件(index.html 所在的文件夹)，兼容各种部署布局：
#   - 标准结构：frontend 在 backend 上一层 (../frontend)
#   - 单文件夹平铺：所有文件(含 index.html)和 main.py 在同一个文件夹
#   - 其他常见位置
_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [
    os.path.join(_HERE, "..", "frontend"),   # backend/ 的上一层（标准结构）
    os.path.join(_HERE, "frontend"),          # backend/ 里面
    os.path.join(os.getcwd(), "frontend"),    # 当前工作目录下
    _HERE,                                     # 和 main.py 同一个文件夹（平铺布局）
    os.getcwd(),                               # 当前工作目录本身
]
# 只认"里面真的有 index.html"的那个文件夹
FRONTEND_DIR = next(
    (p for p in _CANDIDATES if os.path.isfile(os.path.join(p, "index.html"))),
    None,
)


# 关掉浏览器缓存：每次更新前端，用户刷新就能看到新版，不会卡在旧的样式/脚本
@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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
