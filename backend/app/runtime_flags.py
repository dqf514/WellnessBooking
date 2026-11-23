"""运行期开关：登录页是否自动填入演示账号。

后台“场馆设置”里的开关决定默认值，环境变量 LOGIN_DEMO_CREDENTIALS 可以强制关闭，
方便生产环境不依赖人工操作就关闭测试期便利。
"""

from sqlalchemy.orm import Session

from .config import LOGIN_DEMO_CREDENTIALS
from .models import AppSettings

FORCED_OFF = {"0", "false", "no", "off"}


def demo_login_locked() -> bool:
    """环境变量是否强制关闭了演示账号自动填充。"""
    return LOGIN_DEMO_CREDENTIALS in FORCED_OFF


def demo_login_enabled(db: Session) -> bool:
    """登录页是否展示并预填演示账号（admin / admin123）。"""
    if demo_login_locked():
        return False
    row = db.get(AppSettings, 1)
    if row is None:
        return True
    return bool(row.demo_login_enabled)
