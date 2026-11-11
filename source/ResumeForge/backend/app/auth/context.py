# SPDX-License-Identifier: Apache-2.0
"""请求级用户上下文：当前登录用户、他的数据库会话工厂、他的数据目录。

**为什么用 ContextVar 而不是全局变量**：FastAPI 的每个请求跑在自己的 task 里，
ContextVar 天然按请求隔离；换成全局变量，两个用户同时请求就会互相串库。
（`database.get_db` 读的就是这里的工厂。）

**为什么每个用户一个 SQLite 文件**：这个应用的写入面很宽（简历、岗位、台账、任务），
在表上再加 `user_id` 过滤需要改 431 条路由的查询，漏一条就是越权读别人的简历。
一用户一文件是"物理隔离"，漏写 where 也串不了库。
"""

from __future__ import annotations

import threading
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from ..config import DATA_DIR
from ..database import build_engine, database_url_for
from ..database_migrations import run_database_migrations

AUTH_DB_PATH = DATA_DIR / "auth.db"


@dataclass(frozen=True)
class CurrentUser:
    id: int
    email: str
    display_name: str


_current_user: ContextVar[CurrentUser | None] = ContextVar("current_user", default=None)
_current_factory: ContextVar[sessionmaker | None] = ContextVar("current_factory", default=None)

# 引擎缓存：同一用户的连续请求复用连接池，避免每次请求都 open/close 一个 SQLite。
# 上限按小规模内测设定；超了就先关最早的那个（LRU）。
_ENGINES: dict[int, tuple[Engine, sessionmaker]] = {}
_ENGINES_LOCK = threading.Lock()
_MAX_CACHED_USERS = 32


def user_data_dir(user_id: int) -> Path:
    path = DATA_DIR / "users" / str(user_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_database_path(user_id: int) -> Path:
    return user_data_dir(user_id) / "resume_forge.db"


def _factory_for(user_id: int) -> sessionmaker:
    with _ENGINES_LOCK:
        cached = _ENGINES.get(user_id)
        if cached is not None:
            # 命中即刷新顺序（dict 保序，pop+set 等价于 LRU 的 touch）
            _ENGINES.pop(user_id)
            _ENGINES[user_id] = cached
            return cached[1]

    db_path = user_database_path(user_id)
    fresh = not db_path.exists()
    engine = build_engine(database_url_for(db_path))
    if fresh:
        # 新用户第一次登录：把空库迁到当前 head，结构与应用预期一致。
        run_database_migrations(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with _ENGINES_LOCK:
        _ENGINES[user_id] = (engine, factory)
        while len(_ENGINES) > _MAX_CACHED_USERS:
            _, (old_engine, _) = _ENGINES.popitem(last=False)
            old_engine.dispose()
    return factory


def set_current_user(user: CurrentUser | None) -> None:
    if user is None:
        _current_user.set(None)
        _current_factory.set(None)
        return
    _current_user.set(user)
    _current_factory.set(_factory_for(user.id))


def current_user() -> CurrentUser | None:
    return _current_user.get()


def current_factory() -> sessionmaker | None:
    return _current_factory.get()
