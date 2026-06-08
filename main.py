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

from skill_prompt import RESTAURANT_ADVISOR_SKILL

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

# DeepSeek 兼容 OpenAI 接口，只需改 base_url
client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

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
            stream = client.chat.completions.create(
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
            stream = client.chat.completions.create(
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
# 把 frontend 文件夹作为静态网页托管，访问根地址就能打开 app
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")


@app.get("/")
async def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("智餐经营 启动中…")
    print("启动后，用浏览器打开： http://127.0.0.1:8000")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=8000)
