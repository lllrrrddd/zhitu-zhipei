# SPDX-License-Identifier: Apache-2.0
"""账号存储：用户、邀请码、会话。

**为什么单独一个 sqlite 文件**（``data/auth.db``），不并进应用主库：
应用主库是"某个用户的数据"，会被按用户切换/复制/备份；账号是"跨用户的东西"，
混进去之后每份用户库都会带一份用户表，改密码要在 N 个库里改 N 次。

**为什么不用 bcrypt**：发布沙箱只允许一个端口、依赖靠 pip 现场装，少一个带 C 扩展的
依赖就少一处装不上的可能。``hashlib.scrypt`` 是标准库，参数按 RFC 7914 的常用档
（n=2^14, r=8, p=1），单次哈希约 50–100ms，足够挡住离线爆破。
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import string
import time
from dataclasses import dataclass
from pathlib import Path

# scrypt 参数：内存 16MB / 迭代 1 次。调高会让登录变慢，调低会削弱抗爆破。
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_DKLEN = 32

_INVITE_ALPHABET = string.digits  # 纯数字：念得清、抄得对，和重置码同一套格式


@dataclass(frozen=True)
class User:
    id: int
    email: str
    display_name: str
    created_at: str
    phone: str = ""

    @property
    def account(self) -> str:
        """登录名：有邮箱用邮箱，否则用手机号（界面展示与日志都用这个）。"""
        return self.email or self.phone


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_auth_db(db_path: Path) -> None:
    with _connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT UNIQUE,
                phone         TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                display_name  TEXT NOT NULL DEFAULT '',
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS invites (
                code       TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                used_by    INTEGER,
                used_at    TEXT,
                note       TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS reset_codes (
                code       TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used_at    TEXT
            );
            """
        )
        _migrate_users_table(conn)


def _migrate_users_table(conn: sqlite3.Connection) -> None:
    """老库兼容：补 `phone` 列。

    SQLite 不支持"把 NOT NULL 改成可空"，但**保留 email NOT NULL 也没关系**——
    手机号注册的用户把 email 写成空字符串即可（唯一索引允许多个空串），
    查询时按"空串不算邮箱"处理。这样不必重建表，也就不用搬数据。
    """
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
    if "phone" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_DKLEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(digest_hex)),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def create_invite(db_path: Path, note: str = "") -> str:
    code = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(8))
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO invites (code, created_at, note) VALUES (?, ?, ?)",
            (code, _now_iso(), note),
        )
    return code


_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def parse_account(raw: str) -> tuple[str, str]:
    """把用户填的"邮箱或手机号"归一成 (kind, value)。

    kind 只可能是 "email" / "phone"，其它一律 ValueError——**别猜**：
    "1234" 既不像手机也不像邮箱，硬当成手机号会让用户拿一个打不通的账号注册。
    """
    cleaned = (raw or "").strip()
    if _PHONE_RE.match(cleaned):
        return "phone", cleaned
    if "@" in cleaned and "." in cleaned.split("@")[-1] and len(cleaned) <= 254:
        return "email", cleaned.lower()
    raise ValueError("请输入有效的邮箱或 11 位手机号")


def _row_to_user(row: sqlite3.Row) -> User:
    keys = row.keys()
    return User(
        id=row["id"],
        email=row["email"] or "",
        display_name=row["display_name"],
        created_at=row["created_at"],
        phone=(row["phone"] or "") if "phone" in keys else "",
    )


def register_user(
    db_path: Path, account: str, password: str, display_name: str, invite_code: str = ""
) -> User:
    """注册账号。

    ``invite_code`` 现在**可选**：留空就是开放注册（产品已改成"注册就能用"）；
    填了就必须有效——邀请码仍然是一次性的，成功注册才标记 used，失败的尝试不消耗。
    这样既能开放注册，也能在需要的场合用邀请码限流，不必改代码。

    ``account`` 是用户填的"邮箱或手机号"，注册时按类型分别落到 email / phone 列。
    手机号注册的用户 email 存空串（老表 email 是 NOT NULL，空串可重复）。
    """
    kind, value = parse_account(account)
    email = value if kind == "email" else ""
    phone = value if kind == "phone" else None
    if len(password) < 8:
        raise ValueError("密码至少 8 位")
    code = invite_code.strip().upper()

    with _connect(db_path) as conn:
        invite = None
        if code:
            invite = conn.execute("SELECT * FROM invites WHERE code = ?", (code,)).fetchone()
            if invite is None:
                raise ValueError("邀请码无效")
            if invite["used_by"] is not None:
                raise ValueError("邀请码已被使用")
        if kind == "email":
            taken = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        else:
            taken = conn.execute("SELECT 1 FROM users WHERE phone = ?", (phone,)).fetchone()
        if taken:
            raise ValueError("这个账号已经注册过了")

        cursor = conn.execute(
            "INSERT INTO users (email, phone, password_hash, display_name, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (email, phone, hash_password(password), display_name.strip(), _now_iso()),
        )
        user_id = int(cursor.lastrowid)
        if invite is not None:
            conn.execute(
                "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?",
                (user_id, _now_iso(), code),
            )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return _row_to_user(row)


def authenticate(db_path: Path, account: str, password: str) -> User | None:
    kind, value = parse_account(account)
    column = "email" if kind == "email" else "phone"
    # 参数化列名不可行，列名只能来自这个白名单（kind 由 parse_account 保证）
    assert column in {"email", "phone"}
    with _connect(db_path) as conn:
        row = conn.execute(f"SELECT * FROM users WHERE {column} = ?", (value,)).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return None
    return _row_to_user(row)


def get_user(db_path: Path, user_id: int) -> User | None:
    with _connect(db_path) as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        return None
    return _row_to_user(row)


# ── 会话：只存 token 的哈希，库被读走也拿不到可用的 cookie ──────────────────


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db_path: Path, user_id: int, ttl_seconds: int) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_token_hash(token), user_id, _now_iso(), now + ttl_seconds),
        )
        # 顺手清掉过期会话：这张表只增不减的话，久了会拖慢校验。
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    return token


def session_user_id(db_path: Path, token: str) -> int | None:
    if not token:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
            (_token_hash(token),),
        ).fetchone()
    if row is None or row["expires_at"] < int(time.time()):
        return None
    return int(row["user_id"])


def delete_session(db_path: Path, token: str) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


# ── 密码重置：一次性数字码 ────────────────────────────────────────────────
#
# 没有邮件服务（发布环境只有单端口，发不了信），所以做成"管理员发一枚 8 位数字码，
# 用户凭码自助改密"。码只存哈希、24 小时过期、用过一次即作废——它等价于一次性的
# 临时凭据，不能当长期密码用。


def _code_hash(code: str) -> str:
    return hashlib.sha256(f"reset:{code}".encode("utf-8")).hexdigest()


def create_reset_code(db_path: Path, account: str, ttl_seconds: int = 86400 * 1) -> str | None:
    """给指定账号（邮箱或手机号）生成一枚重置码；账号不存在返回 None。"""
    kind, value = parse_account(account)
    column = "email" if kind == "email" else "phone"
    with _connect(db_path) as conn:
        row = conn.execute(f"SELECT id FROM users WHERE {column} = ?", (value,)).fetchone()
        if row is None:
            return None
        code = "".join(secrets.choice(string.digits) for _ in range(8))
        conn.execute(
            "INSERT INTO reset_codes (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_code_hash(code), int(row["id"]), _now_iso(), int(time.time()) + ttl_seconds),
        )
    return code


def reset_password(db_path: Path, account: str, code: str, new_password: str) -> bool:
    """凭重置码改密。成功返回 True，并作废该用户全部会话（旧 cookie 立即失效）。"""
    if len(new_password) < 8:
        raise ValueError("密码至少 8 位")
    cleaned = code.strip()
    kind, value = parse_account(account)
    column = "email" if kind == "email" else "phone"
    with _connect(db_path) as conn:
        row = conn.execute(f"SELECT id FROM users WHERE {column} = ?", (value,)).fetchone()
        if row is None:
            return False
        user_id = int(row["id"])
        record = conn.execute(
            "SELECT * FROM reset_codes WHERE code = ?", (_code_hash(cleaned),)
        ).fetchone()
        if record is None or record["user_id"] != user_id:
            return False
        if record["used_at"] is not None or record["expires_at"] < int(time.time()):
            return False
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )
        conn.execute(
            "UPDATE reset_codes SET used_at = ? WHERE code = ?", (_now_iso(), _code_hash(cleaned))
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return True


def purge_invalid_reset_codes(db_path: Path) -> int:
    """清掉过期/已用的重置码（启动时跑一次即可）。"""
    with _connect(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM reset_codes WHERE used_at IS NOT NULL OR expires_at < ?",
            (int(time.time()),),
        )
        return cursor.rowcount
