# SPDX-License-Identifier: Apache-2.0
"""账号相关接口：注册（需邀请码）、登录、退出、当前身份。

刻意做成**同源 cookie 会话**而不是 Bearer token：前端与后端同端口部署
（见 `mount_static_spa`），cookie 让所有既有 `fetch("/api/...")` 自动带上身份，
不用改那 431 条路由的调用方式。
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .context import AUTH_DB_PATH, CurrentUser, current_user
from .store import (
    authenticate,
    create_invite,
    create_session,
    delete_session,
    get_user,
    init_auth_db,
    register_user,
    session_user_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "zhiyin_session"
SESSION_TTL = timedelta(days=14)


def _cookie_secure() -> bool:
    return os.environ.get("ZY_COOKIE_SECURE", "0") == "1"


def ensure_auth_ready() -> None:
    """启动时调用：建表 + 保证演示用的邀请码存在。

    邀请码来源优先级：`ZY_INVITE_CODE` 环境变量（部署时指定）> 自动生成一个并写进日志。
    自动生成只在"库里一个邀请码都没有"时发生，避免每次重启都多出一枚。
    """
    init_auth_db(AUTH_DB_PATH)
    preset = os.environ.get("ZY_INVITE_CODE", "").strip().upper()
    if preset:
        import sqlite3

        with sqlite3.connect(AUTH_DB_PATH) as conn:
            exists = conn.execute("SELECT 1 FROM invites WHERE code = ?", (preset,)).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO invites (code, created_at, note) VALUES (?, ?, ?)",
                    (preset, datetime.now(timezone.utc).isoformat(timespec="seconds"), "环境变量预设"),
                )
        logger.info("账号体系就绪：已确保邀请码存在")
        return

    import sqlite3

    with sqlite3.connect(AUTH_DB_PATH) as conn:
        any_invite = conn.execute("SELECT 1 FROM invites LIMIT 1").fetchone()
    if not any_invite:
        code = create_invite(AUTH_DB_PATH, note="自动生成（首启）")
        logger.warning("账号体系首次启动，已生成邀请码：%s", code)


class RegisterRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)
    display_name: str = Field(default="", max_length=60)
    invite: str = Field(max_length=32)


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )


def _user_payload(user: CurrentUser | None) -> dict[str, object]:
    if user is None:
        return {"user": None}
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "displayName": user.display_name,
        }
    }


def require_login() -> bool:
    """托管模式（部署到公网）打开后，未登录只能读、不能写。

    单机本地用法不受影响：`ZY_REQUIRE_LOGIN` 缺省为 0，一切照旧。
    """
    return os.environ.get("ZY_REQUIRE_LOGIN", "0") == "1"


@router.get("/config")
def auth_config() -> dict[str, object]:
    return {"requireLogin": require_login()}


@router.get("/me")
def me(request: Request) -> dict[str, object]:
    return _user_payload(current_user())


@router.post("/register")
def register(payload: RegisterRequest, response: Response) -> dict[str, object]:
    try:
        user = register_user(
            AUTH_DB_PATH, payload.email, payload.password, payload.display_name, payload.invite
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_session(AUTH_DB_PATH, user.id, int(SESSION_TTL.total_seconds()))
    _set_session_cookie(response, token)
    logger.info("新用户注册成功 id=%s", user.id)
    return {"user": {"id": user.id, "email": user.email, "displayName": user.display_name}}


@router.post("/login")
def login(payload: LoginRequest, response: Response) -> dict[str, object]:
    user = authenticate(AUTH_DB_PATH, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="邮箱或密码不正确")
    token = create_session(AUTH_DB_PATH, user.id, int(SESSION_TTL.total_seconds()))
    _set_session_cookie(response, token)
    return {"user": {"id": user.id, "email": user.email, "displayName": user.display_name}}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, object]:
    token = request.cookies.get(COOKIE_NAME, "")
    if token:
        delete_session(AUTH_DB_PATH, token)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


def resolve_request_user(request: Request) -> CurrentUser | None:
    """从 cookie 解析当前用户；给中间件用。"""
    token = request.cookies.get(COOKIE_NAME, "")
    if not token:
        return None
    user_id = session_user_id(AUTH_DB_PATH, token)
    if user_id is None:
        return None
    record = get_user(AUTH_DB_PATH, user_id)
    if record is None:
        return None
    return CurrentUser(id=record.id, email=record.email, display_name=record.display_name)
