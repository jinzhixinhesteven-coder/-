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
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

# 兼容两种启动方式：本地 python main.py，云端 uvicorn backend.main:app
try:
    from skill_prompt import RESTAURANT_ADVISOR_SKILL   # 本地从 backend/ 内运行
    import db
except ImportError:
    from backend.skill_prompt import RESTAURANT_ADVISOR_SKILL  # 从项目根运行
    from backend import db

db.init_db()   # 启动时建表（已存在则跳过）

# 开发者后台密钥：设了环境变量 ADMIN_KEY 就用它，否则用默认（建议线上一定设一个）
ADMIN_KEY = os.environ.get("ADMIN_KEY", "zhican-admin-2026")

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


# ============ AI 每日点评（非流式，返回一句话）============
@app.post("/api/daily")
async def daily(request: Request):
    """根据当日/近期数据，生成一句简短的经营点评。前端每天调用一次并缓存。"""
    body = await request.json()
    store_data = json.dumps(body, ensure_ascii=False)
    if not API_KEY:
        return {"ok": False, "text": ""}
    try:
        resp = get_client().chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": RESTAURANT_ADVISOR_SKILL},
                {"role": "user", "content": (
                    "下面是我餐厅今天和本月的数据。请用一两句话（60字内）给一句今日经营点评："
                    "点出今天最值得注意的一个数（好或不好），并给一句可执行的小提示。"
                    "专业、直接、口语化，不要标题不要列表，就一两句话。\n" + store_data
                )},
            ],
            stream=False,
            temperature=0.5,
            max_tokens=200,
        )
        text = resp.choices[0].message.content.strip()
        return {"ok": True, "text": text}
    except Exception as e:
        return {"ok": False, "text": f"（点评生成失败：{e}）"}


# ============ 账号 & 数据持久化接口 ============
@app.post("/api/register")
async def api_register(request: Request):
    b = await request.json()
    ok, res = db.register(b.get("username", ""), b.get("password", ""))
    if ok:
        return {"ok": True, "token": res, "username": (b.get("username") or "").strip()}
    return {"ok": False, "error": res}


@app.post("/api/login")
async def api_login(request: Request):
    b = await request.json()
    ok, res = db.login(b.get("username", ""), b.get("password", ""))
    if ok:
        return {"ok": True, "token": res, "username": (b.get("username") or "").strip()}
    return {"ok": False, "error": res}


@app.post("/api/save")
async def api_save(request: Request):
    b = await request.json()
    ok, res = db.save_data(b.get("token", ""), b.get("data", {}))
    return {"ok": ok, "msg": res}


@app.post("/api/load")
async def api_load(request: Request):
    b = await request.json()
    ok, msg, data = db.load_data(b.get("token", ""))
    return {"ok": ok, "msg": msg, "data": data}


# ============ 开发者后台（用密钥访问，看所有存储的数据）============
@app.get("/api/admin/data")
async def admin_data(key: str = ""):
    if key != ADMIN_KEY:
        return {"ok": False, "error": "密钥不对"}
    return {"ok": True, "stats": db.admin_stats(), "users": db.admin_list_all()}


@app.get("/admin")
async def admin_page():
    """一个简单的开发者后台页面：输入密钥后查看所有用户和数据。"""
    html = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"><title>智餐经营 · 开发者后台</title>
<style>
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:980px;margin:24px auto;padding:0 18px;color:#1f2329;background:#f6f7f9}
h1{font-size:22px}.bar{display:flex;gap:8px;margin:16px 0}
input{padding:10px 12px;border:1px solid #dadce0;border-radius:8px;font-size:14px;flex:1}
button{padding:10px 18px;border:none;border-radius:8px;background:#e8632a;color:#fff;font-weight:600;cursor:pointer}
.stat{background:#fff;border:1px solid #e8eaed;border-radius:10px;padding:14px;margin-bottom:14px;font-size:14px}
.user{background:#fff;border:1px solid #e8eaed;border-radius:10px;padding:16px;margin-bottom:12px}
.user h3{margin:0 0 8px;font-size:16px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th,td{padding:7px 8px;text-align:left;border-bottom:1px solid #eef0f3}th{color:#5f6571}
pre{background:#f1f3f5;border-radius:8px;padding:12px;font-size:12px;overflow:auto;max-height:300px}
details{margin-top:8px}summary{cursor:pointer;color:#b8481c;font-size:13px}
.muted{color:#6b7280;font-size:13px}
</style></head><body>
<h1>智餐经营 · 开发者后台</h1>
<div class="muted">输入开发者密钥，查看所有注册用户和他们上传的数据，确认数据已真实存储。</div>
<div class="bar"><input id="key" type="password" placeholder="开发者密钥"><button onclick="load()">查看数据</button></div>
<div id="out"></div>
<script>
async function load(){
  const key=document.getElementById('key').value;
  const out=document.getElementById('out');out.innerHTML='加载中…';
  try{
    const r=await fetch('/api/admin/data?key='+encodeURIComponent(key));
    const j=await r.json();
    if(!j.ok){out.innerHTML='<div class="stat" style="color:#cc2f3f">'+(j.error||'失败')+'</div>';return;}
    let h='<div class="stat"><b>总用户数：'+j.stats.user_count+'</b> · 数据库文件：<code>'+j.stats.db_path+'</code></div>';
    if(!j.users.length)h+='<div class="stat">还没有任何注册用户。</div>';
    j.users.forEach(u=>{
      h+='<div class="user"><h3>#'+u.id+' '+u.username+' <span class="muted">· '+u.store_count+' 家店</span></h3>';
      if(u.stores.length){
        h+='<table><tr><th>门店</th><th>业态</th><th>记录天数</th><th>首条</th><th>最近</th><th>菜品数</th></tr>';
        u.stores.forEach(s=>{h+='<tr><td>'+s.name+'</td><td>'+s.type+'</td><td>'+s.record_days+'</td><td>'+(s.first_date||'-')+'</td><td>'+(s.last_date||'-')+'</td><td>'+s.dishes+'</td></tr>';});
        h+='</table>';
      }else{h+='<div class="muted">该用户还没有录入数据。</div>';}
      h+='<details><summary>查看完整原始数据 (JSON)</summary><pre>'+JSON.stringify(u.raw_data,null,2)+'</pre></details></div>';
    });
    out.innerHTML=h;
  }catch(e){out.innerHTML='<div class="stat" style="color:#cc2f3f">出错：'+e.message+'</div>';}
}
</script></body></html>"""
    return HTMLResponse(html)


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
