"""Build the approved fictional sample from a workbook, without names/birth dates.
Read-only openpyxl; run with the bundled Python runtime. Source file is never edited.
"""
import sys, json, hashlib
from pathlib import Path
from datetime import date, datetime
import openpyxl

source = Path(sys.argv[1])
book = openpyxl.load_workbook(source, read_only=True, data_only=True)
def scalar(value):
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    return "" if value is None else value
def records(name):
    values = iter(book[name].values)
    headers = next(values)
    return [dict(zip(headers, map(scalar, row))) for row in values]
staff = records("직원기본정보")
history = records("월별인사현황")
attendance = records("월별근태휴가")
payroll = records("월별인건비")
latest = {}
for row in history:
    if row["사번"] not in latest or row["기준월"] > latest[row["사번"]]["기준월"]:
        latest[row["사번"]] = row
pay_index = {(r["사번"], r["기준월"]):r for r in payroll}
assert len(pay_index) == len(payroll) == len(attendance) == 3414
people = [[r["사번"], r["입사일"], r["퇴사일"], latest[r["사번"]]["부서"], latest[r["사번"]]["고용형태"]] for r in staff]
months = []
for row in attendance:
    p = pay_index[(row["사번"], row["기준월"])]
    assert p["총지급액_원"] + p["회사부담보험료_원"] + p["퇴직급여충당액_원"] == p["총인건비_원"]
    months.append([row["사번"], row["기준월"], row["총근무시간"], row["연장근무시간"], row["총휴가일수"], p["총지급액_원"], p["회사부담보험료_원"], p["퇴직급여충당액_원"]])
reference = []
for month in sorted(set(r["기준월"] for r in history)):
    h = [r for r in history if r["기준월"] == month]
    a = [r for r in attendance if r["기준월"] == month]
    p = [r for r in payroll if r["기준월"] == month]
    reference.append([month[:7], sum(r["월말재직여부"] for r in h), sum(r["당월입사여부"] for r in h), sum(r["당월퇴사여부"] for r in h), sum(r["총근무시간"] for r in a), sum(r["연장근무시간"] for r in a), sum(r["총휴가일수"] for r in a), sum(r["총인건비_원"] for r in p)])
assert len(people) == 180 and len(reference) == 24 and reference[-1][1] == 150
output = Path(__file__).resolve().parents[1] / "shared/samples/synthetic-20261005.json"
output.parent.mkdir(parents=True, exist_ok=True)
payload = {"source": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "people":people, "months":months, "reference":reference}
output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
book.close()
print(json.dumps({"people":len(people), "months":len(months), "lastMonth":reference[-1], "bytes":output.stat().st_size}))
