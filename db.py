# -*- coding: utf-8 -*-
"""
数据库层 —— 用 SQLite 持久化保存每个用户的门店数据。
为什么用 SQLite：单文件、零配置、足够支撑试用阶段（几十到几百用户没问题）。
数据文件默认放在 DATA_DIR（可用环境变量指定到持久磁盘，见 main.py 说明）。
"""
import os
import sqlite3
import json
import hashlib
import secrets
import time

# 数据库文件位置：优先用环境变量 DATA_DIR（部署到持久磁盘时指定），否则放当前目录
DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(DATA_DIR, "zhican.db")


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """建表（已存在则跳过）。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                pw_hash TEXT NOT NULL,
                pw_salt TEXT NOT NULL,
                token TEXT,
                created_at INTEGER,
                data TEXT
            )
        """)
        c.commit()


# ---------- 密码处理（加盐哈希，不存明文）----------
def _hash_pw(password, salt):
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def register(username, password):
    """注册新用户。返回 (ok, token_or_errmsg)。"""
    username = (username or "").strip()
    if len(username) < 2:
        return False, "用户名至少 2 个字符"
    if len(password or "") < 4:
        return False, "密码至少 4 位"
    salt = secrets.token_hex(8)
    pw_hash = _hash_pw(password, salt)
    token = secrets.token_hex(16)
    try:
        with _conn() as c:
            c.execute(
                "INSERT INTO users (username, pw_hash, pw_salt, token, created_at, data) VALUES (?,?,?,?,?,?)",
                (username, pw_hash, salt, token, int(time.time()), ""),
            )
            c.commit()
        return True, token
    except sqlite3.IntegrityError:
        return False, "这个用户名已被注册，换一个或直接登录"


def login(username, password):
    """登录。返回 (ok, token_or_errmsg)。"""
    username = (username or "").strip()
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        return False, "用户名不存在，请先注册"
    if _hash_pw(password, row["pw_salt"]) != row["pw_hash"]:
        return False, "密码不对"
    # 登录成功，刷新 token
    token = secrets.token_hex(16)
    with _conn() as c:
        c.execute("UPDATE users SET token=? WHERE id=?", (token, row["id"]))
        c.commit()
    return True, token


def _user_by_token(token):
    if not token:
        return None
    with _conn() as c:
        return c.execute("SELECT * FROM users WHERE token=?", (token,)).fetchone()


def save_data(token, data_dict):
    """保存某用户的门店数据（整个 data 对象）。"""
    user = _user_by_token(token)
    if not user:
        return False, "登录已过期，请重新登录"
    with _conn() as c:
        c.execute("UPDATE users SET data=? WHERE id=?", (json.dumps(data_dict, ensure_ascii=False), user["id"]))
        c.commit()
    return True, "ok"


def load_data(token):
    """读取某用户的门店数据。"""
    user = _user_by_token(token)
    if not user:
        return False, "登录已过期，请重新登录", None
    data = user["data"]
    try:
        parsed = json.loads(data) if data else None
    except Exception:
        parsed = None
    return True, "ok", parsed


def whoami(token):
    user = _user_by_token(token)
    return user["username"] if user else None
