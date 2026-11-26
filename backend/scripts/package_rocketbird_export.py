"""把勤鸟导出目录打包成可上传的 ZIP。

后台「系统设置 → 历史数据导入」需要上传 ZIP 压缩包；本脚本用于把勤鸟导出的
CSV 目录打包，同时排除与导入无关的文件（Excel 汇总表、说明文档等）。

用法：

    backend/.venv/Scripts/python backend/scripts/package_rocketbird_export.py \
        --dir ../historicalData/rocketbird_export \
        --out ../historicalData/rocketbird_export.zip
"""

import argparse
import zipfile
from pathlib import Path

# 只需要这些 CSV；其余文件（工作簿、说明、缓存）不打包。
REQUIRED = ("members.csv", "member_cards.csv", "sign_logs.csv", "finance_flow.csv")


def main() -> int:
    parser = argparse.ArgumentParser(description="打包勤鸟导出目录为 ZIP")
    parser.add_argument("--dir", required=True, help="勤鸟导出 CSV 目录")
    parser.add_argument("--out", default="", help="输出 ZIP 路径（默认为 <目录>.zip）")
    args = parser.parse_args()

    source = Path(args.dir).resolve()
    if not source.is_dir():
        print(f"目录不存在：{source}")
        return 2
    missing = [name for name in REQUIRED if not (source / name).exists()]
    if missing:
        print(f"目录里缺少必需文件：{'、'.join(missing)}")
        return 2

    target = Path(args.out).resolve() if args.out else source.with_suffix(".zip")
    target.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(item for item in source.glob("*.csv") if item.is_file())
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in files:
            archive.write(item, arcname=item.name)
    size = target.stat().st_size
    print(f"已打包 {len(files)} 个 CSV → {target}（{size // 1024} KB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
