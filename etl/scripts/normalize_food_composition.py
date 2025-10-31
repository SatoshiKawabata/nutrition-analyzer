#!/usr/bin/env python3
"""
日本食品標準成分表（八訂・増補 2023）CSV を正規化テーブル向けに分解する補助スクリプト。

出力: 指定ディレクトリに下記 CSV を生成
- data_sources.csv
- food_groups.csv
- foods.csv
    - nutrient_components.csv
    - food_nutrient_values.csv
    - value_annotation_defs.csv
    - raw_snapshots.csv

それぞれ db/schema.sql に合わせた列構成で作成し、Supabase や PostgreSQL の COPY で投入できるフォーマットに整形する。
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple


# 食品群コード→名称（八訂準拠）
FOOD_GROUP_NAMES = {
    "01": "穀類",
    "02": "いも及びでん粉類",
    "03": "砂糖及び甘味類",
    "04": "豆類",
    "05": "種実類",
    "06": "野菜類",
    "07": "果実類",
    "08": "きのこ類",
    "09": "藻類",
    "10": "魚介類",
    "11": "肉類",
    "12": "卵類",
    "13": "乳類",
    "14": "油脂類",
    "15": "菓子類",
    "16": "し好飲料類",
    "17": "調味料及び香辛料類",
    "18": "調理加工食品類",
}

# 欠落しているコードのフォールバック
COMPONENT_CODE_FALLBACKS = {
    ("無機質", "ナトリウム"): "NA",
}

# アノテーション記号のデフォルト意味 (必要に応じて後から編集)
DEFAULT_ANNOTATION_MEANINGS = {
    "*": "要確認（参考値・資料値など特記事項あり）",
    "†": "要確認（原資料の脚注参照）",
}

@dataclass
class ComponentMeta:
    column_index: int
    component_code: str
    group_1_name_ja: str
    group_2_name_ja: Optional[str]
    group_3_name_ja: Optional[str]
    unit: Optional[str]
    category: str
    original_sort_order: int
    annotation_cols: List[int] = field(default_factory=list)
    has_inline_flag: bool = False


def forward_fill(values: Sequence[str]) -> List[str]:
    """左方向に前方埋めを行う（先頭は空白のまま）。"""
    filled: List[str] = []
    current = ""
    for value in values:
        text = value.strip()
        if text:
            current = text
        filled.append(current)
    return filled


def load_rows(path: Path) -> List[List[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.reader(fp)
        return [row for row in reader]


def extract_publish_date(first_row: Sequence[str]) -> Optional[datetime]:
    joined = "".join(first_row)
    match = re.search(r"更新日：?(\d{4})年(\d{1,2})月(\d{1,2})日", joined)
    if not match:
        return None
    year, month, day = map(int, match.groups())
    return datetime(year, month, day)


def build_component_metadata(rows: List[List[str]]) -> Tuple[List[ComponentMeta], List[int]]:
    header_rows = rows[:12]
    level1_raw = header_rows[2]
    level2_raw = header_rows[3]
    level3_raw = header_rows[4]
    level1 = forward_fill(level1_raw)
    units = header_rows[10]
    codes = header_rows[11]

    components: List[ComponentMeta] = []
    annotation_columns: List[int] = []
    prev_component: Optional[ComponentMeta] = None
    sort_order = 1

    for idx in range(4, len(codes)):
        if idx == 61:  # 備考列
            continue

        unit = units[idx].strip() if idx < len(units) else ""
        code = codes[idx].strip()
        g1_filled = level1[idx].strip() if idx < len(level1) else ""
        g2 = level2_raw[idx].strip() if idx < len(level2_raw) else ""
        g3 = level3_raw[idx].strip() if idx < len(level3_raw) else ""

        is_annotation_col = not code and not unit and not (
            (idx < len(level1_raw) and level1_raw[idx].strip())
            or (idx < len(level2_raw) and level2_raw[idx].strip())
            or (idx < len(level3_raw) and level3_raw[idx].strip())
        )
        if is_annotation_col:
            annotation_columns.append(idx)
            if prev_component:
                prev_component.annotation_cols.append(idx)
            continue

        if not code:
            key = (g1_filled, g2 or g3)
            code = COMPONENT_CODE_FALLBACKS.get(key)
            if not code:
                raise ValueError(f"列 {idx} の成分コードが判別できません: {key}")

        category = g1_filled or (prev_component.category if prev_component else "その他")

        component = ComponentMeta(
            column_index=idx,
            component_code=code,
            group_1_name_ja=g1_filled or category,
            group_2_name_ja=g2 or None,
            group_3_name_ja=g3 or None,
            unit=unit or None,
            category=category,
            original_sort_order=sort_order,
        )
        components.append(component)
        prev_component = component
        sort_order += 1

    return components, annotation_columns


def iter_food_rows(rows: List[List[str]]) -> Iterable[List[str]]:
    for row in rows[12:]:
        if not row or not row[1].strip():
            continue
        yield row


def parse_value(raw_text: str) -> Tuple[Optional[Decimal], bool, bool, bool, Optional[str], str]:
    raw = raw_text.strip()
    if not raw:
        return None, False, False, True, None, raw_text

    in_parentheses = raw.startswith("(") and raw.endswith(")")
    core = raw[1:-1].strip() if in_parentheses else raw

    inline_symbol = None
    if core.endswith("†"):
        inline_symbol = "†"
        core = core[:-1].strip()

    normalized = core.replace(",", "")
    upper = normalized.upper()
    if upper in {"-", "―", "–"}:
        return None, in_parentheses, False, True, inline_symbol, raw_text
    if upper == "TR":
        return None, in_parentheses, True, False, inline_symbol, raw_text

    try:
        value = Decimal(normalized)
    except InvalidOperation:
        # 解析不能な場合は欠測扱い
        return None, in_parentheses, False, True, inline_symbol, raw_text
    return value, in_parentheses, False, False, inline_symbol, raw_text


def decimal_to_str(value: Optional[Decimal]) -> str:
    if value is None:
        return ""
    quantized = value.normalize()
    return format(quantized, "f").rstrip("0").rstrip(".") if "." in format(quantized, "f") else format(quantized, "f")


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, fieldnames: Sequence[str], rows: Iterable[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description="日本食品標準成分表（八訂 増補2023）CSV 正規化補助ツール")
    parser.add_argument("input_csv", type=Path, help="加工済み CSV ファイルパス")
    parser.add_argument("--output-dir", type=Path, default=Path("build"), help="出力ディレクトリ (default: build)")
    parser.add_argument("--data-source-id", type=str, help="既存 data_sources.id を指定する場合の UUID")
    parser.add_argument("--data-source-title", type=str, default="日本食品標準成分表（八訂）増補2023年", help="data_sources.title")
    parser.add_argument("--file-name", type=str, help="data_sources.file_name を上書き")
    args = parser.parse_args()

    rows = load_rows(args.input_csv)
    if not rows:
        raise SystemExit("CSV が空です。")

    components, annotation_columns = build_component_metadata(rows)

    publish_dt = extract_publish_date(rows[0])

    data_source_id = uuid.UUID(args.data_source_id) if args.data_source_id else uuid.uuid4()
    file_name = args.file_name or args.input_csv.name

    ensure_output_dir(args.output_dir)

    data_sources_rows = [{
        "id": str(data_source_id),
        "title": args.data_source_title,
        "file_name": file_name,
        "publish_date": publish_dt.date().isoformat() if publish_dt else "",
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
    }]
    write_csv(args.output_dir / "data_sources.csv", data_sources_rows[0].keys(), data_sources_rows)

    group_id_map = {}
    food_rows = list(iter_food_rows(rows))
    group_order: List[str] = []
    for row in food_rows:
        code = row[0].strip()
        if code and code not in group_order:
            group_order.append(code)

    group_records = []
    for order, code in enumerate(group_order, start=1):
        group_id = uuid.uuid4()
        group_id_map[code] = group_id
        group_name = FOOD_GROUP_NAMES.get(code, f"食品群{code}")
        group_records.append({
            "id": str(group_id),
            "data_source_id": str(data_source_id),
            "group_code": code,
            "name_jp": group_name,
            "original_sort_order": order,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
        })
    write_csv(args.output_dir / "food_groups.csv", group_records[0].keys(), group_records)

    # annotation symbol -> uuid
    annotation_symbol_map: dict[str, uuid.UUID] = {}

    component_id_map: dict[int, uuid.UUID] = {comp.column_index: uuid.uuid4() for comp in components}

    # Foods, raw snapshots & values
    food_records = []
    value_records = []
    snapshot_records = []
    for row in food_rows:
        group_code = row[0].strip()
        food_code = row[1].strip()
        if not food_code:
            continue

        food_id = uuid.uuid4()
        group_id = group_id_map[group_code]
        index_code = row[2].strip()
        name_jp = row[3].strip()
        waste_rate = row[4].strip()
        remarks = row[61].strip() if len(row) > 61 else ""

        raw_payload = {
            "food_group_code": group_code,
            "food_code": food_code,
            "index_code": index_code,
            "food_name": name_jp,
            "waste_rate_raw": waste_rate,
            "values": {
                components[i].component_code: row[components[i].column_index].strip()
                for i in range(len(components))
                if components[i].column_index < len(row)
            },
            "annotations": {
                components[i].component_code: [
                    row[idx].strip() for idx in components[i].annotation_cols if idx < len(row) and row[idx].strip()
                ]
                for i in range(len(components))
                if components[i].annotation_cols
            },
            "remarks": remarks,
        }

        food_records.append({
            "id": str(food_id),
            "data_source_id": str(data_source_id),
            "food_code": food_code,
            "index_code": index_code,
            "group_id": str(group_id),
            "name_jp": name_jp,
            "waste_rate": waste_rate or "",
            "remarks": remarks,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
        })

        snapshot_records.append({
            "id": str(uuid.uuid4()),
            "data_source_id": str(data_source_id),
            "food_id": str(food_id),
            "payload": json.dumps(raw_payload, ensure_ascii=False),
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
        })

        for comp in components:
            col_idx = comp.column_index
            raw_value = row[col_idx].strip() if col_idx < len(row) else ""
            value_numeric, in_parentheses, is_tr, is_missing, inline_symbol, value_raw = parse_value(raw_value)

            annotation_symbol = inline_symbol
            for ann_idx in comp.annotation_cols:
                if ann_idx < len(row):
                    ann_val = row[ann_idx].strip()
                    if ann_val:
                        annotation_symbol = ann_val
                        break

            if annotation_symbol:
                comp.has_inline_flag = True
                if annotation_symbol not in annotation_symbol_map:
                    annotation_symbol_map[annotation_symbol] = uuid.uuid4()

            value_records.append({
                "id": str(uuid.uuid4()),
                "data_source_id": str(data_source_id),
                "food_id": str(food_id),
                "component_id": str(component_id_map[col_idx]),
                "value_numeric": decimal_to_str(value_numeric),
                "value_raw": value_raw.strip(),
                "value_annotation_id": str(annotation_symbol_map[annotation_symbol]) if annotation_symbol else "",
                "in_parentheses": "t" if in_parentheses else "f",
                "is_tr": "t" if is_tr else "f",
                "is_missing": "t" if is_missing else "f",
                "created_at": datetime.utcnow().isoformat(timespec="seconds"),
                "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
            })

    write_csv(
        args.output_dir / "foods.csv",
        food_records[0].keys(),
        food_records,
    )

    write_csv(
        args.output_dir / "food_nutrient_values.csv",
        value_records[0].keys(),
        value_records,
    )

    write_csv(
        args.output_dir / "raw_snapshots.csv",
        snapshot_records[0].keys(),
        snapshot_records,
    )

    component_records = []
    for comp in components:
        component_records.append({
            "id": str(component_id_map[comp.column_index]),
            "data_source_id": str(data_source_id),
            "component_code": comp.component_code,
            "group_1_name_ja": comp.group_1_name_ja,
            "group_2_name_ja": comp.group_2_name_ja or "",
            "group_3_name_ja": comp.group_3_name_ja or "",
            "unit": comp.unit or "",
            "category": comp.category,
            "has_flag": "t" if (comp.annotation_cols or comp.has_inline_flag) else "f",
            "original_sort_order": comp.original_sort_order,
            "note": "",
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
        })

    write_csv(
        args.output_dir / "nutrient_components.csv",
        component_records[0].keys(),
        component_records,
    )

    annotation_records = []
    for symbol, ann_id in annotation_symbol_map.items():
        annotation_records.append({
            "id": str(ann_id),
            "data_source_id": str(data_source_id),
            "symbol": symbol,
            "meaning": DEFAULT_ANNOTATION_MEANINGS.get(symbol, "要確認（原資料参照）"),
            "note": "",
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
        })

    if annotation_records:
        write_csv(
            args.output_dir / "value_annotation_defs.csv",
            annotation_records[0].keys(),
            annotation_records,
        )


if __name__ == "__main__":
    main()
