"""勤鸟历史数据导入命令行工具。

用法（在 backend 目录下）：

    backend/.venv/Scripts/python backend/scripts/import_rocketbird.py \
        --dir ../historicalData/rocketbird_export --dry-run

    backend/.venv/Scripts/python backend/scripts/import_rocketbird.py \
        --dir ../historicalData/rocketbird_export --report ../historicalData/import_report.json

参数：
    --dir       勤鸟导出目录（CSV 所在目录），必填
    --db        指定 SQLite 数据库文件（默认用 DATABASE_URL 或 backend/data/wellness.db）
    --dry-run   只做演练：不提交事务，输出报告即可
    --no-logs   跳过操作日志导入
    --report    把导入报告写成 JSON 文件
"""

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def main() -> int:
    parser = argparse.ArgumentParser(description="导入勤鸟运动 SaaS 历史数据")
    parser.add_argument("--dir", required=True, help="勤鸟导出 CSV 目录")
    parser.add_argument("--db", default="", help="SQLite 数据库文件路径")
    parser.add_argument("--dry-run", action="store_true", help="只演练不提交")
    parser.add_argument("--no-logs", action="store_true", help="跳过操作日志导入")
    parser.add_argument("--report", default="", help="导入报告 JSON 输出路径")
    args = parser.parse_args()

    if args.db:
        # Windows 下要用反斜杠路径，否则 SQLite 会把 "D:/..." 当成相对路径。
        database_path = Path(args.db).resolve()
        os.environ["DATABASE_URL"] = f"sqlite:///{database_path if os.name == 'nt' else database_path.as_posix()}"

    from app.database import Base, SessionLocal, engine, ensure_constraints, ensure_schema
    from app.legacy_import import import_rocketbird

    source = Path(args.dir).resolve()
    if not source.exists():
        print(f"目录不存在：{source}")
        return 2

    Base.metadata.create_all(bind=engine)
    ensure_schema()
    ensure_constraints()

    db = SessionLocal()
    try:
        report = import_rocketbird(db, source, dry_run=args.dry_run, include_logs=not args.no_logs)
        if args.dry_run:
            db.rollback()
    finally:
        db.close()

    print(f"\n勤鸟历史数据导入{'（演练）' if args.dry_run else ''}完成")
    print("-" * 60)
    for table, stats in report["tables"].items():
        print(f"{table:<16} 读取 {stats['read']:>7}  导入 {stats['created']:>7}  跳过 {stats['skipped']:>6}")
    if report["warnings"]:
        print("\n提示：")
        for item in report["warnings"]:
            print(f"  · {item}")
    if report["notes"]:
        print("\n说明：")
        for item in report["notes"]:
            print(f"  · {item}")

    if args.report:
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n报告已写入 {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
