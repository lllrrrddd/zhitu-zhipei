# SPDX-License-Identifier: Apache-2.0
"""用户文件根目录：登录用户各自一份，未登录回落全局。

**为什么数据库已经分库了，文件还要单独处理**：SQLite 按用户分文件，但上传的原始简历、
导出物、附件预览缓存、网页填写用的浏览器 profile 都是直接写在 `DATA_DIR/xxx` 下的——
那些路径不进数据库，光分库挡不住"甲看到乙上传的 PDF"。

**为什么不把 `DATA_DIR` 整个换成每用户**：`DATA_DIR` 是模块级常量，被几十处按值引用
（日志、字体、岗位库、auth.db 都在它下面），换基根会把全局资源也一起搬走。这里只接管
"**属于某个人的产物**"，全局资源（字体/日志/招聘库/账号库）仍留在 `DATA_DIR`。

未登录时返回 `DATA_DIR` 本身：本地单机模式与游客只读浏览都还是老行为。
"""

from __future__ import annotations

from pathlib import Path

from ..config import DATA_DIR


def user_scope_root() -> Path:
    """当前用户的文件根；没有登录用户时返回全局根。"""
    # 延迟导入：auth.context 会经 database → 本包，模块顶部互相导入会成环。
    from ..auth.context import current_user

    user = current_user()
    if user is None:
        return DATA_DIR
    root = DATA_DIR / "users" / str(user.id) / "files"
    root.mkdir(parents=True, exist_ok=True)
    return root
