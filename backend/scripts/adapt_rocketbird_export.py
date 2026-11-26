"""把勤鸟导出数据适配成可直接导入的版本。

勤鸟导出的「资源」与「商品」名称是中英文混在一起的，例如：

- 课种：``瑜伽拉伸与声音共振 Yogic Stretch & Sound Resonance``
- 教室：``谈天说地 3 Connection 3``
- 教练：``Lisa Tang 汤双双``
- 卡产品：``合一文化节门票 At One Festival``

原始导出目录保持不动（排期、签到等表引用的是原文，改了会对不上），
本脚本另存一份适配目录，给四张基础资料表补上「中文名 / 英文名」两列，
再打包成 ZIP，直接在后台「历史数据导入」里上传即可。

用法（在仓库根目录执行）::

    backend/.venv/Scripts/python backend/scripts/adapt_rocketbird_export.py \
        --dir historicalData/rocketbird_export \
        --out historicalData/rocketbird_export_adapted

    backend/.venv/Scripts/python backend/scripts/adapt_rocketbird_export.py \
        --dir historicalData/rocketbird_export \
        --out historicalData/rocketbird_export_adapted --zip
"""

import argparse
import csv
import shutil
import sys
import zipfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.legacy_import import PRODUCT_ALIASES  # noqa: E402
from app.name_normalizer import split_bilingual  # noqa: E402

# 需要补中英文分列的基础资料表：文件名 → (原名列, 中文名列, 英文名列)
CATALOGUE_COLUMNS = {
    "class_types.csv": ("课程名称", "课程中文名", "课程英文名"),
    "classrooms.csv": ("教室名称", "教室中文名", "教室英文名"),
    "staff_coaches.csv": ("姓名", "教练中文名", "教练英文名"),
    "card_products.csv": ("卡名称", "卡中文名", "卡英文名"),
    # 卡产品目录是三张表合起来的：这里只补列，不改原有的卡名与卡号，导入时的对应关系不受影响。
    "member_cards.csv": ("卡课名称", "卡中文名", "卡英文名"),
    "contract_orders.csv": ("卡课名称", "卡中文名", "卡英文名"),
}
# 按卡名处理的表：先过别名表再拆中英文。
CARD_TABLES = {"card_products.csv", "member_cards.csv", "contract_orders.csv"}
# 卡名归一：勤鸟里的别名统一到本系统的标准卡名。
CARD_ALIASES = PRODUCT_ALIASES


def read_rows(path: Path) -> tuple[list[str], list[dict]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        return fieldnames, [dict(row) for row in reader]


def write_rows(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def adapt_catalogue(path: Path, source_column: str, zh_column: str, en_column: str, *, is_card: bool = False) -> dict:
    """给一张基础资料表补上中文名 / 英文名两列，返回处理统计。"""
    fieldnames, rows = read_rows(path)
    stats = {"rows": len(rows), "split": 0, "alias": 0, "unchanged": 0}
    if source_column not in fieldnames:
        return stats
    for row in rows:
        raw = " ".join(str(row.get(source_column, "") or "").split())
        if not raw:
            continue
        if is_card:
            canonical = CARD_ALIASES.get(raw, raw)
            if canonical != raw:
                stats["alias"] += 1
            name, name_en = split_bilingual(canonical)
        else:
            name, name_en = split_bilingual(raw)
        row[zh_column] = name
        row[en_column] = name_en
        if name != raw or name_en:
            stats["split"] += 1
        else:
            stats["unchanged"] += 1
    for column in (zh_column, en_column):
        if column not in fieldnames:
            fieldnames.append(column)
    write_rows(path, fieldnames, rows)
    return stats


def build_readme(source: Path, summary: dict) -> str:
    lines = [
        "# 勤鸟导出数据 · 适配版",
        "",
        f"来源目录：`{source}`",
        "",
        "## 这次适配做了什么",
        "",
        "1. **资源与商品的名称拆成中英文两列**：课种、教室、教练、卡产品四张表各多出",
        "   「中文名 / 英文名」两列，导入后中文显示在名称栏、英文显示在英文名栏，界面不再中英文混排。",
        "2. **卡名归一**：勤鸟里「体质咨询与健康评估（大众点评）」这类别名统一成标准卡名，",
        "   同一张卡不会因为写法不同变成两个产品。",
        "3. **原始数据保持原样**：排期、签到、流水等表引用的是勤鸟原文名，动了就对不上，",
        "   因此这些表一个字节都没有改，原始名称列也全部保留。",
        "",
        "## 导入方法",
        "",
        "1. 后台登录管理员账号，进入「系统设置 → 历史数据导入」。",
        "2. 点「选择 ZIP 并导入」，选中本目录打包出来的 ZIP。",
        "3. 建议先勾选「先演练」跑一遍看统计，确认没问题再取消勾选正式导入。",
        "4. 导入完成后到「资源管理」检查课种、教室、教练与卡产品的中英文是否分开显示。",
        "",
        "## 表格清单",
        "",
        "| 文件 | 处理 |",
        "| --- | --- |",
    ]
    for name, stats in summary.items():
        lines.append(f"| {name} | 共 {stats['rows']} 行，拆分中英文 {stats['split']} 行，卡名归一 {stats['alias']} 行 |")
    lines += [
        "",
        "## 提醒",
        "",
        "- 本压缩包含会员姓名、手机号等个人信息，请勿外传，也请勿提交到代码仓库。",
        "- 重复导入按勤鸟外部 ID 幂等跳过，已导入的数据不会被重复写入。",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="把勤鸟导出数据适配成可直接导入的 ZIP")
    parser.add_argument("--dir", required=True, help="勤鸟导出目录（原始 CSV 所在目录）")
    parser.add_argument("--out", default="", help="适配后的输出目录，默认在源目录旁生成 <源目录名>_adapted")
    parser.add_argument("--zip", action="store_true", help="同时打包成 ZIP")
    args = parser.parse_args()

    source = Path(args.dir).resolve()
    if not source.exists():
        print(f"目录不存在：{source}")
        return 2
    target = Path(args.out).resolve() if args.out else source.with_name(f"{source.name}_adapted")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    summary: dict[str, dict] = {}
    for item in sorted(source.iterdir()):
        if item.is_dir():
            continue
        if item.suffix.lower() == ".csv":
            shutil.copy2(item, target / item.name)
        elif item.suffix.lower() in {".md", ".xlsx"}:
            shutil.copy2(item, target / item.name)

    for filename, (source_column, zh_column, en_column) in CATALOGUE_COLUMNS.items():
        path = target / filename
        if not path.exists():
            print(f"跳过（文件不存在）：{filename}")
            continue
        stats = adapt_catalogue(path, source_column, zh_column, en_column, is_card=filename in CARD_TABLES)
        summary[filename] = stats

    (target / "适配说明.md").write_text(build_readme(source, summary), encoding="utf-8")

    print("适配完成")
    print("-" * 60)
    for name, stats in summary.items():
        print(f"{name:<22} {stats['rows']:>6} 行  拆分中英文 {stats['split']:>5}  卡名归一 {stats['alias']:>4}")
    print(f"\n输出目录：{target}")

    if args.zip:
        archive = target.with_suffix(".zip")
        if archive.exists():
            archive.unlink()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for item in sorted(target.rglob("*")):
                if item.is_file():
                    bundle.write(item, item.relative_to(target.parent))
        print(f"压缩包：{archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
