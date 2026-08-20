from __future__ import annotations

import json
import math
import os
import re
import io
import sqlite3
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, time as datetime_time
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
try:
    import cgi
except ModuleNotFoundError:
    cgi = None

import pandas as pd


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
BASE_PATH = "/" + os.environ.get("BASE_PATH", "").strip("/") if os.environ.get("BASE_PATH", "").strip("/") else ""
UPLOADS = ROOT / "work" / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "work"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("DB_PATH", DATA_DIR / "ecargo.sqlite"))
PROJECTS_FILE = Path(os.environ.get("PROJECTS_FILE", DATA_DIR / "projects.json"))
LEGACY_REPO = ROOT / "chamados222pendencias.exe-master" / "chamados222pendencias.exe-master"
LEGACY_SOURCE = LEGACY_REPO / "Chamados222Pendencias" / "Repository" / "Impls" / "ChamadosRepository.cs"

MONTH_NAMES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]

TARGET_GROUP_ID = "24"
TARGET_GROUP_NAME = "SUPORTE ECARGO"
SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", "600"))
SYNC_LOOKBACK_HOURS = int(os.environ.get("SYNC_LOOKBACK_HOURS", "2"))
APPROVAL_DATE_FIELDS = [
    field.strip()
    for field in os.environ.get(
        "ECARGO_APPROVAL_DATE_FIELDS",
        "approval_time,approved_time,approve_time,approval_date,approved_date",
    ).split(",")
    if field.strip()
]


RAW_COLUMNS = [
    "#",
    "Tipo de Registro de Serviço",
    "Categoria",
    "Subcategoria",
    "Categoria de terceiro nível",
    "Status",
    "Localidade",
    "Tipo de função",
    "Funcionalidade",
    "Descrição",
    "Título",
    "Usuário a ser Atendido",
    "Departamento",
    "Data de solicitação",
    "Data de aprovação",
    "Data de encerramento",
    "Item Legal",
    "Causa:",
    "Complexidade",
    "Analista Responsável",
    "Grupo solucionador",
    "Impacto",
]


def _clean_value(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if pd.isna(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d %H:%M")
    return value


def _parse_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", dayfirst=True)


def _find_header_row(raw: pd.DataFrame) -> int:
    for idx in range(min(15, len(raw))):
        values = {str(v).strip() for v in raw.iloc[idx].tolist() if not pd.isna(v)}
        if "#" in values and "Data de solicitação" in values:
            return idx
    return 0


def _read_workbook(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, header=None, dtype=object)
    header_idx = _find_header_row(raw)
    headers = [str(v).strip() if not pd.isna(v) else "" for v in raw.iloc[header_idx].tolist()]
    data = raw.iloc[header_idx + 1 :].copy()
    data.columns = headers
    data = data.dropna(how="all")

    for col in RAW_COLUMNS:
        if col not in data.columns:
            data[col] = ""

    data = data[RAW_COLUMNS].copy()
    data = data[data["#"].notna() & (data["#"].astype(str).str.strip() != "")]
    return data


def _build_records(df: pd.DataFrame) -> list[dict]:
    opened = _parse_date(df["Data de solicitação"])
    approved = _parse_date(df["Data de aprovação"])
    closed = _parse_date(df["Data de encerramento"])
    duration = ((closed - opened).dt.total_seconds() / 3600).round(1)
    iso = opened.dt.isocalendar()

    records: list[dict] = []
    for i, row in df.iterrows():
        open_dt = opened.loc[i]
        close_dt = closed.loc[i]
        dur = duration.loc[i]
        status_group = "Finalizado" if pd.notna(close_dt) else "Em aberto"
        month_no = int(open_dt.month) if pd.notna(open_dt) else None
        year = int(open_dt.year) if pd.notna(open_dt) else None
        week = int(iso.week.loc[i]) if pd.notna(open_dt) else None
        week_start = open_dt - pd.Timedelta(days=int(open_dt.weekday())) if pd.notna(open_dt) else None
        week_end = week_start + pd.Timedelta(days=6) if week_start is not None else None

        item = {col: _clean_value(row[col]) for col in RAW_COLUMNS}
        item.update(
            {
                "Ano solicitação": year,
                "Mês número": month_no,
                "Mês nome": MONTH_NAMES[month_no - 1] if month_no else "",
                "Mês solicitação": open_dt.strftime("%Y-%m") if pd.notna(open_dt) else "",
                "Semana do ano": week,
                "Início semana": week_start.strftime("%Y-%m-%d") if week_start is not None else "",
                "Fim semana": week_end.strftime("%Y-%m-%d") if week_end is not None else "",
                "Situação gerencial": status_group,
                "Tempo atendimento (h)": None if pd.isna(dur) else float(dur),
                "Data de solicitação": open_dt.strftime("%Y-%m-%d %H:%M") if pd.notna(open_dt) else "",
                "Data de aprovação": approved.loc[i].strftime("%Y-%m-%d %H:%M") if pd.notna(approved.loc[i]) else "",
                "Data de encerramento": close_dt.strftime("%Y-%m-%d %H:%M") if pd.notna(close_dt) else "",
            }
        )
        records.append(item)
    return records


def _options(records: list[dict]) -> dict:
    def uniq(key):
        values = {r.get(key) for r in records if r.get(key) not in ("", None)}
        return sorted(values)

    return {
        "categorias": uniq("Categoria de terceiro nível"),
        "subcategorias": uniq("Subcategoria"),
        "anos": uniq("Ano solicitação"),
        "meses": [
            {"numero": n, "nome": name}
            for n, name in enumerate(
                MONTH_NAMES,
                start=1,
            )
        ],
    }


def analyze(path: Path) -> dict:
    df = _read_workbook(path)
    records = _filter_target_group(_build_records(df))
    return {"records": records, "options": _options(records), "total": len(records)}


class UploadFile:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self.file = io.BytesIO(data)


def _read_uploaded_file(headers, rfile) -> UploadFile | None:
    content_type = headers.get("Content-Type", "")
    if cgi is not None:
        form = cgi.FieldStorage(fp=rfile, headers=headers, environ={"REQUEST_METHOD": "POST"})
        return form["file"] if "file" in form else None

    match = re.search(r'boundary="?([^";]+)"?', content_type)
    if not match:
        return None
    length = int(headers.get("Content-Length", "0") or "0")
    body = rfile.read(length)
    boundary = b"--" + match.group(1).encode("utf-8")
    for part in body.split(boundary):
        if b'Content-Disposition:' not in part or b'name="file"' not in part:
            continue
        header_blob, _, content = part.partition(b"\r\n\r\n")
        disposition = header_blob.decode("utf-8", errors="replace")
        filename_match = re.search(r'filename="([^"]+)"', disposition)
        if not filename_match:
            return None
        return UploadFile(filename_match.group(1), content.rstrip(b"\r\n-"))
    return None


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _db() as conn:
        conn.execute(
            """
            create table if not exists tickets (
                id text primary key,
                payload text not null,
                opened_at text,
                closed_at text,
                updated_at text not null
            )
            """
        )
        conn.execute(
            """
            create table if not exists sync_state (
                key text primary key,
                value text not null
            )
            """
        )


def _set_state(key: str, value: str) -> None:
    with _db() as conn:
        conn.execute(
            "insert into sync_state(key, value) values(?, ?) on conflict(key) do update set value=excluded.value",
            (key, value),
        )


def _get_state(key: str) -> str:
    with _db() as conn:
        row = conn.execute("select value from sync_state where key = ?", (key,)).fetchone()
    return "" if row is None else str(row["value"])


def upsert_records(records: list[dict], source: str) -> dict:
    now = datetime.now().isoformat(timespec="seconds")
    inserted = 0
    updated = 0
    with _db() as conn:
        for record in records:
            ticket_id = str(record.get("#", "")).strip()
            if not ticket_id:
                continue
            exists = conn.execute("select 1 from tickets where id = ?", (ticket_id,)).fetchone()
            conn.execute(
                """
                insert into tickets(id, payload, opened_at, closed_at, updated_at)
                values(?, ?, ?, ?, ?)
                on conflict(id) do update set
                    payload=excluded.payload,
                    opened_at=excluded.opened_at,
                    closed_at=excluded.closed_at,
                    updated_at=excluded.updated_at
                """,
                (
                    ticket_id,
                    json.dumps(record, ensure_ascii=False),
                    str(record.get("Data de solicitação", "")),
                    str(record.get("Data de encerramento", "")),
                    now,
                ),
            )
            if exists:
                updated += 1
            else:
                inserted += 1
        conn.execute(
            "insert into sync_state(key, value) values(?, ?) on conflict(key) do update set value=excluded.value",
            ("last_import_source", source),
        )
        conn.execute(
            "insert into sync_state(key, value) values(?, ?) on conflict(key) do update set value=excluded.value",
            ("last_import_at", now),
        )
    return {"inserted": inserted, "updated": updated, "processed": inserted + updated}


def base_records() -> list[dict]:
    with _db() as conn:
        rows = conn.execute("select payload from tickets order by opened_at").fetchall()
    return [json.loads(row["payload"]) for row in rows]


def base_payload(extra: dict | None = None) -> dict:
    records = base_records()
    payload = {
        "records": records,
        "options": _options(records),
        "total": len(records),
        "source": "base",
        "sync": {
            "last_import_at": _get_state("last_import_at"),
            "last_import_source": _get_state("last_import_source"),
            "last_sync_at": _get_state("last_sync_at"),
            "last_sync_status": _get_state("last_sync_status"),
        },
    }
    if extra:
        payload.update(extra)
    return payload


def _filter_target_group(records: list[dict]) -> list[dict]:
    return [
        record
        for record in records
        if str(record.get("Grupo solucionador", "")).strip().upper() == TARGET_GROUP_NAME
    ]


def _legacy_credentials() -> tuple[str, str]:
    env_user = os.environ.get("ECARGO_222_USER", "").strip()
    env_password = os.environ.get("ECARGO_222_PASSWORD", "").strip()
    if env_user and env_password:
        return env_user, env_password

    if not LEGACY_SOURCE.exists():
        raise RuntimeError("Credenciais não configuradas. Defina ECARGO_222_USER e ECARGO_222_PASSWORD.")

    src = LEGACY_SOURCE.read_text(encoding="utf-8", errors="ignore")
    user = re.search(r'\\"user_name\\":\s*\\"([^"]+)\\"', src)
    password = re.search(r'\\"password\\":\s*\\"([^"]+)\\"', src)
    if not user or not password:
        raise RuntimeError("Não encontrei as credenciais da API no projeto antigo.")
    return user.group(1), password.group(1)


def _open_json(opener: urllib.request.OpenerDirector, request: urllib.request.Request, timeout: int = 60):
    with opener.open(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _login_222() -> urllib.request.OpenerDirector:
    user, password = _legacy_credentials()
    jar = CookieJar()
    body = json.dumps({"user_name": user, "password": password}).encode("utf-8")
    last_error = None
    openers = [
        urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar),
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),
        ),
        urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar),
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),
            _NoRedirect,
        ),
    ]

    for url in (
        "http://loginlogistica.sysaid.com.br/api/v1/login",
        "https://loginlogistica.sysaid.com.br/api/v1/login",
        "https://loginlogistica.sysaid.com.br/api/v1/login/",
    ):
        for opener in openers:
            request = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "E-Cargo-Analytics/1.0",
                },
                method="POST",
            )
            try:
                _open_json(opener, request, timeout=30)
                if list(jar):
                    return opener
                last_error = "login sem cookie de sessão"
            except urllib.error.HTTPError as exc:
                last_error = f"HTTP {exc.code}: {exc.reason}"
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {str(exc)[:160]}"

    raise RuntimeError(f"Falha ao autenticar na API 222 ({last_error}).")


def _sysaid_caption(info: dict[str, dict], key: str) -> str:
    item = info.get(key) or {}
    value = item.get("valueCaption")
    if value in (None, ""):
        value = item.get("value")
    return "" if value in (None, "null") else str(value)


def _sysaid_date(info: dict[str, dict], key: str) -> str:
    item = info.get(key) or {}
    value = item.get("valueCaption") or item.get("value")
    if value in (None, "", "0"):
        return ""
    text = str(value)
    if text.isdigit() and len(text) >= 12:
        return pd.to_datetime(int(text), unit="ms", errors="coerce").strftime("%Y-%m-%d %H:%M")
    return text


def _sysaid_first_date(info: dict[str, dict], keys: list[str]) -> str:
    for key in keys:
        value = _sysaid_date(info, key)
        if value:
            return value
    return ""


def _sysaid_to_dataframe(items: list[dict]) -> pd.DataFrame:
    rows = []
    for item in items:
        info = {entry.get("key"): entry for entry in item.get("info", []) if entry.get("key")}
        rows.append(
            {
                "#": item.get("id", ""),
                "Tipo de Registro de Serviço": _sysaid_caption(info, "sr_type"),
                "Categoria": _sysaid_caption(info, "category") or "SISTEMAS",
                "Subcategoria": _sysaid_caption(info, "subcategory") or "E-CARGO",
                "Categoria de terceiro nível": _sysaid_caption(info, "third_level_category"),
                "Status": _sysaid_caption(info, "status"),
                "Localidade": _sysaid_caption(info, "location"),
                "Tipo de função": _sysaid_caption(info, "CustomColumn438sr"),
                "Funcionalidade": _sysaid_caption(info, "CustomColumn439sr"),
                "Descrição": _sysaid_caption(info, "description"),
                "Título": _sysaid_caption(info, "title"),
                "Usuário a ser Atendido": _sysaid_caption(info, "request_user"),
                "Departamento": _sysaid_caption(info, "department"),
                "Data de solicitação": _sysaid_date(info, "insert_time"),
                "Data de aprovação": _sysaid_first_date(info, APPROVAL_DATE_FIELDS),
                "Data de encerramento": _sysaid_date(info, "close_time"),
                "Item Legal": _sysaid_caption(info, "CustomColumn440sr"),
                "Causa:": _sysaid_caption(info, "CustomColumn427sr"),
                "Complexidade": _sysaid_caption(info, "CustomColumn441sr"),
                "Analista Responsável": _sysaid_caption(info, "responsibility"),
                "Grupo solucionador": _sysaid_caption(info, "assigned_group"),
                "Impacto": _sysaid_caption(info, "impact") or _sysaid_caption(info, "urgency"),
            }
        )
    return pd.DataFrame(rows, columns=RAW_COLUMNS)


def _date_range(start_date: str | None = None, end_date: str | None = None, hours: int | None = None) -> tuple[datetime, datetime]:
    if start_date and end_date:
        start_dt = datetime.combine(datetime.strptime(start_date, "%Y-%m-%d").date(), datetime_time.min)
        end_dt = datetime.combine(datetime.strptime(end_date, "%Y-%m-%d").date(), datetime_time.max)
        if end_dt < start_dt:
            raise RuntimeError("Data final não pode ser menor que a data inicial.")
        span_days = (end_dt.date() - start_dt.date()).days + 1
        if span_days > 370:
            raise RuntimeError("Use um intervalo de no máximo 370 dias.")
        return start_dt, end_dt

    resolved_hours = max(1, min(int(hours or 24), 24 * 370))
    end_dt = datetime.now()
    return end_dt - timedelta(hours=resolved_hours), end_dt


def _ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def _sysaid_field_sets() -> list[list[str]]:
    return [
        [
            "status",
            "request_user",
            "insert_time",
            *APPROVAL_DATE_FIELDS,
            "update_time",
            "description",
            "responsibility",
            "title",
            "close_time",
            "sr_type",
            "solution",
            "CustomColumn427sr",
            "third_level_category",
            "category",
            "subcategory",
            "location",
            "department",
            "assigned_group",
            "impact",
            "urgency",
            "CustomColumn438sr",
            "CustomColumn439sr",
            "CustomColumn440sr",
            "CustomColumn441sr",
        ],
        [
            "status",
            "request_user",
            "insert_time",
            "update_time",
            "description",
            "responsibility",
            "title",
            "close_time",
            "sr_type",
            "solution",
            "CustomColumn427sr",
            "third_level_category",
            "assigned_group",
        ],
        [
            "status",
            "request_user",
            "insert_time",
            "close_time",
            "title",
            "third_level_category",
            "assigned_group",
        ],
    ]


def _fetch_222_items(
    opener: urllib.request.OpenerDirector,
    start: datetime,
    end: datetime,
    date_field: str,
    group_scope: str,
) -> list[dict]:
    field_sets = [
        *(_sysaid_field_sets()),
    ]
    last_error = None
    for fields in field_sets:
        query = urllib.parse.urlencode(
            {
                "fields": ",".join(fields),
                date_field: f"{_ms(start)},{_ms(end)}",
            },
            safe=",",
        )
        if group_scope in {"ecargo", "signa"}:
            query = f"assigned_group={TARGET_GROUP_ID}&" + query
        for base in (
            "https://loginlogistica.sysaid.com.br/api/v1/sr/",
            "http://loginlogistica.sysaid.com.br/api/v1/sr/",
        ):
            request = urllib.request.Request(
                f"{base}?{query}",
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            try:
                data = _open_json(opener, request, timeout=90)
                if not isinstance(data, list):
                    raise RuntimeError(f"resposta inesperada da API: {type(data).__name__}")
                return data
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")[:120]
                last_error = f"HTTP {exc.code}: {detail}"
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {str(exc)[:160]}"

    raise RuntimeError(f"Não consegui consultar chamados na API 222 ({last_error}).")


def _month_chunks(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    chunks = []
    cursor = start
    while cursor <= end:
        next_month = datetime(cursor.year + (cursor.month // 12), (cursor.month % 12) + 1, 1)
        chunk_end = min(end, next_month - timedelta(microseconds=1))
        chunks.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(microseconds=1)
    return chunks


def _day_chunks(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    chunks = []
    cursor = start
    while cursor <= end:
        day_end = min(end, datetime.combine(cursor.date(), datetime_time.max))
        chunks.append((cursor, day_end))
        cursor = day_end + timedelta(microseconds=1)
    return chunks


def _fetch_222_range(opener: urllib.request.OpenerDirector, start: datetime, end: datetime, date_field: str, group_scope: str) -> list[dict]:
    items_by_id: dict[str, dict] = {}
    chunks = _day_chunks(start, end) if group_scope == "all" else _month_chunks(start, end)
    for chunk_start, chunk_end in chunks:
        try:
            items = _fetch_222_items(opener, chunk_start, chunk_end, date_field, group_scope)
        except Exception:
            if chunk_start.date() == chunk_end.date():
                raise
            items = []
            for day_start, day_end in _day_chunks(chunk_start, chunk_end):
                items.extend(_fetch_222_items(opener, day_start, day_end, date_field, group_scope))

        if len(items) >= 40 and chunk_start.date() != chunk_end.date():
            items = []
            for day_start, day_end in _day_chunks(chunk_start, chunk_end):
                items.extend(_fetch_222_items(opener, day_start, day_end, date_field, group_scope))

        for item in items:
            item_id = str(item.get("id", ""))
            if item_id:
                items_by_id[item_id] = item
    return list(items_by_id.values())


def _ecargo_like(records: list[dict]) -> list[dict]:
    known_categories = {
        "AJUSTE DE BOOKING",
        "AJUSTE DE OS",
        "AJUSTE DE PROPOSTA",
        "AJUSTE DE REFATURAMENTO",
        "AJUSTE GERAL",
        "ALTERAR PERFIL",
        "ALTERAÇÃO DE PERFIL - REVISÃO",
        "BLOQUEAR ACESSO",
        "CARGA DE DADOS",
        "CRIAÇÃO/ALTERAÇÃO PERFIL",
        "DESBLOQUEAR ACESSO",
        "ERRO",
        "ERRO NO ACESSO",
        "EVOLUTIVA",
        "EXECUTAR SCRIPT",
        "EXTRAÇÃO DE DADOS",
        "INDISPONIBILIDADE",
        "LENTIDÃO",
        "LIBERAR ACESSO",
        "MANUTENÇÃO DE PERFIL",
        "MUDANÇA",
        "NOVO ACESSO",
        "REMOVER ACESSO",
        "REMOVER ACESSO - COMUNICADO RH",
        "REMOVER ACESSO - DESLIGAMENTO",
        "REMOVER ACESSO - MOVIMENTAÇÃO",
        "REMOVER ACESSO - REVISÃO",
        "RESET DE SENHA",
        "SUPORTE AO USO",
        "SUPORTE INTEGRAÇÕES BI",
        "SUPORTE INTEGRAÇÕES COM NSP/OPENTECH",
        "SUPORTE INTEGRAÇÕES EDI",
        "SUPORTE INTEGRAÇÕES SAP",
        "SUPORTE INTEGRAÇÕES SOLVER",
    }
    return [r for r in records if str(r.get("Categoria de terceiro nível", "")).upper() in known_categories]


def fetch_222(
    hours: int = 24,
    start_date: str | None = None,
    end_date: str | None = None,
    group_scope: str = "all",
) -> dict:
    opener = _login_222()
    start, end = _date_range(start_date, end_date, hours)
    date_field = "insert_time" if start_date and end_date else "update_time"
    data = _fetch_222_range(opener, start, end, date_field, group_scope)
    records = _filter_target_group(_ecargo_like(_build_records(_sysaid_to_dataframe(data))))
    return {
        "records": records,
        "options": _options(records),
        "total": len(records),
        "source": "222",
        "warning": (
            "A API operacional do 222 pode retornar menos chamados que o relatório exportado. "
            "Use o upload do Excel para números gerenciais até mapearmos o endpoint do relatório."
        ),
        "period": {"start": start_date, "end": end_date, "field": date_field, "group_scope": group_scope},
    }


def sync_222_once() -> dict:
    result = fetch_222(hours=SYNC_LOOKBACK_HOURS, group_scope="ecargo")
    import_result = upsert_records(result["records"], "222-auto")
    now = datetime.now().isoformat(timespec="seconds")
    _set_state("last_sync_at", now)
    _set_state(
        "last_sync_status",
        f"ok: {import_result['processed']} processados, {import_result['inserted']} novos, {import_result['updated']} atualizados",
    )
    return import_result


def sync_loop() -> None:
    while True:
        try:
            sync_222_once()
        except Exception as exc:
            _set_state("last_sync_status", f"erro: {type(exc).__name__}: {str(exc)[:180]}")
        time.sleep(SYNC_INTERVAL_SECONDS)


def start_background_sync() -> None:
    if os.environ.get("ENABLE_AUTO_SYNC", "1").strip().lower() in {"0", "false", "no"}:
        return
    thread = threading.Thread(target=sync_loop, daemon=True, name="ecargo-222-sync")
    thread.start()


PROJECT_EXTENSIONS = {".xml", ".mpp", ".mpt"}


def ensure_projects_store() -> None:
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_FILE.exists():
        PROJECTS_FILE.write_text("[]\n", encoding="utf-8")


def read_projects() -> list[dict]:
    ensure_projects_store()
    return json.loads(PROJECTS_FILE.read_text(encoding="utf-8") or "[]")


def write_projects(projects: list[dict]) -> None:
    ensure_projects_store()
    PROJECTS_FILE.write_text(json.dumps(projects, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _project_text(node: ET.Element | None, name: str) -> str:
    if node is None:
        return ""
    child = node.find(name)
    return "" if child is None or child.text is None else str(child.text).strip()


def _project_children(node: ET.Element | None, name: str) -> list[ET.Element]:
    if node is None:
        return []
    return list(node.findall(name))


def _project_date(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        parsed_ts = pd.to_datetime(text, errors="coerce")
        if pd.isna(parsed_ts):
            return None
        parsed = parsed_ts.to_pydatetime()
    return parsed.replace(tzinfo=None)


def _project_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _project_number(value, fallback: float = 0) -> float:
    try:
        number = float(str(value).replace("%", "").replace(",", ".").strip())
    except Exception:
        return fallback
    return number if math.isfinite(number) else fallback


def _project_percent(value, fallback: float = 0) -> int:
    return max(0, min(100, round(_project_number(value, fallback))))


def _project_add_days(value: datetime, days: int) -> datetime:
    return value + timedelta(days=days)


def _planned_percent_by_date(start: datetime | None, finish: datetime | None, reference: datetime) -> int:
    if not start or not finish:
        return 0
    if reference <= start:
        return 0
    if reference >= finish:
        return 100
    duration = (finish - start).total_seconds()
    if duration <= 0:
        return 100
    return round(((reference - start).total_seconds() / duration) * 100)


def _find_latest_schedule(folder_path: str) -> dict | None:
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise RuntimeError("O caminho informado não é uma pasta acessível pelo servidor.")
    files = []
    for path in folder.iterdir():
        if not path.is_file() or path.suffix.lower() not in PROJECT_EXTENSIONS:
            continue
        stat = path.stat()
        files.append({"name": path.name, "path": str(path), "extension": path.suffix.lower(), "modifiedAt": datetime.fromtimestamp(stat.st_mtime), "size": stat.st_size})
    files.sort(key=lambda item: item["modifiedAt"], reverse=True)
    return files[0] if files else None


def _find_custom_field_id(root: ET.Element, alias_text: str) -> str | None:
    attributes = root.find("ExtendedAttributes")
    for field in _project_children(attributes, "ExtendedAttribute"):
        if alias_text.lower() in _project_text(field, "Alias").lower():
            return _project_text(field, "FieldID")
    return None


def _task_extended_value(task: ET.Element, field_id: str | None) -> str | None:
    if not field_id:
        return None
    for attribute in _project_children(task, "ExtendedAttribute"):
        if _project_text(attribute, "FieldID") == str(field_id):
            return _project_text(attribute, "Value")
    return None


def _project_tasks(root: ET.Element) -> list[ET.Element]:
    tasks_root = root.find("Tasks")
    return [task for task in _project_children(tasks_root, "Task") if _project_text(task, "Name")]


def _project_summary_task(tasks: list[ET.Element]) -> ET.Element | None:
    for task in tasks:
        if _project_text(task, "ID") == "0":
            return task
    for task in tasks:
        if _project_text(task, "Summary") == "1" and _project_text(task, "OutlineLevel") in {"0", "1"}:
            return task
    return None


def summarize_xml_project(xml_text: str, file_info: dict) -> dict:
    root = ET.fromstring(xml_text)
    if "}" in root.tag:
        for element in root.iter():
            element.tag = element.tag.split("}", 1)[1]

    tasks = _project_tasks(root)
    summary_task = _project_summary_task(tasks)
    planned_field_id = _find_custom_field_id(root, "planejado")
    display_tasks = [task for task in tasks if _project_text(task, "ID") != "0"]
    measurable_tasks = [task for task in display_tasks if _project_text(task, "Summary") != "1"]
    usable_tasks = measurable_tasks or display_tasks
    now = datetime.now()
    attention_limit = _project_add_days(now, 7)

    completed = in_progress = late = attention = 0
    percent_total = planned_total = 0
    earliest_start = latest_finish = None
    task_rows = []

    for task in display_tasks:
        percent = _project_percent(_project_text(task, "PercentComplete"))
        start = _project_date(_project_text(task, "Start"))
        finish = _project_date(_project_text(task, "Finish"))
        planned = _project_percent(_task_extended_value(task, planned_field_id), _planned_percent_by_date(start, finish, now))
        is_summary = _project_text(task, "Summary") == "1"
        is_complete = percent >= 100
        is_in_progress = 0 < percent < 100
        is_late = bool(finish and finish < now and not is_complete)
        needs_attention = bool(not is_complete and (is_late or (finish and finish <= attention_limit)))

        if not is_summary:
            completed += 1 if is_complete else 0
            in_progress += 1 if is_in_progress else 0
            late += 1 if is_late else 0
            attention += 1 if needs_attention else 0
            percent_total += percent
            planned_total += planned

        if start and (earliest_start is None or start < earliest_start):
            earliest_start = start
        if finish and (latest_finish is None or finish > latest_finish):
            latest_finish = finish

        task_rows.append(
            {
                "id": _project_text(task, "ID") or _project_text(task, "UID"),
                "name": _project_text(task, "Name") or "Sem nome",
                "outlineLevel": int(_project_number(_project_text(task, "OutlineLevel"), 1)),
                "outlineNumber": _project_text(task, "OutlineNumber"),
                "summary": is_summary,
                "start": _project_iso(start),
                "finish": _project_iso(finish),
                "percent": percent,
                "plannedPercent": planned,
                "inProgress": is_in_progress,
                "late": is_late,
                "attention": needs_attention,
            }
        )

    total = len(usable_tasks)
    avg_percent = round(percent_total / total) if total else 0
    avg_planned = round(planned_total / total) if total else 0
    realized = _project_percent(_project_text(summary_task, "PercentComplete"), avg_percent) if summary_task is not None else avg_percent
    planned = _project_percent(_task_extended_value(summary_task, planned_field_id), avg_planned) if summary_task is not None else avg_planned

    return {
        "status": "parsed",
        "sourceType": "xml",
        "file": file_info,
        "projectName": _project_text(root, "Name") or _project_text(root, "Title") or Path(file_info["name"]).stem,
        "start": _project_iso(_project_date(_project_text(root, "StartDate")) or earliest_start),
        "finish": _project_iso(_project_date(_project_text(root, "FinishDate")) or latest_finish),
        "totalTasks": total,
        "completedTasks": completed,
        "inProgressTasks": in_progress,
        "lateTasks": late,
        "attentionTasks": attention,
        "percentComplete": realized,
        "plannedPercent": planned,
        "realizedPercent": realized,
        "variancePercent": realized - planned,
        "tasks": task_rows,
        "message": "Cronograma XML lido com sucesso." if total else "Arquivo XML encontrado, mas nenhuma tarefa foi identificada.",
    }


def inspect_project(project: dict) -> dict:
    latest = _find_latest_schedule(str(project.get("folderPath", "")))
    if not latest:
        return {"status": "missing", "message": "Nenhum arquivo .xml, .mpp ou .mpt foi encontrado na pasta cadastrada."}

    file_info = {
        "name": latest["name"],
        "path": latest["path"],
        "extension": latest["extension"],
        "modifiedAt": latest["modifiedAt"].isoformat(),
        "size": latest["size"],
    }
    if latest["extension"] != ".xml":
        return {
            "status": "unsupported",
            "sourceType": latest["extension"].replace(".", ""),
            "file": file_info,
            "message": "No app unificado, exporte o cronograma para XML para leitura automática. A conversão MPP/MPT será tratada em uma etapa separada.",
        }

    return summarize_xml_project(Path(latest["path"]).read_text(encoding="utf-8", errors="ignore"), file_info)


def projects_payload() -> list[dict]:
    enriched = []
    for project in read_projects():
        try:
            enriched.append({**project, "dashboard": inspect_project(project)})
        except Exception as exc:
            enriched.append({**project, "dashboard": {"status": "error", "message": str(exc)}})
    return enriched


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
        }
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        body = path.read_bytes()
        if path.suffix == ".html":
            body = body.replace(b"__BASE_PATH__", BASE_PATH.encode("utf-8"))
        self.send_response(200)
        self.send_header("Content-Type", content_types.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self._route_path()
        if path == "/api/base":
            self._send_json(base_payload())
            return
        if path == "/api/projects":
            self._send_json(projects_payload())
            return
        if path == "/api/fetch-222":
            params = parse_qs(urlparse(self.path).query)
            hours = int(params.get("hours", ["24"])[0] or "24")
            start_date = params.get("start", [None])[0]
            end_date = params.get("end", [None])[0]
            group_scope = params.get("scope", ["all"])[0]
            try:
                result = fetch_222(hours=hours, start_date=start_date, end_date=end_date, group_scope=group_scope)
                import_result = upsert_records(result["records"], "222-manual")
                self._send_json(
                    base_payload(
                        {
                            "import_result": import_result,
                            "warning": result.get("warning", ""),
                            "period": result.get("period", {}),
                        }
                    )
                )
            except Exception as exc:
                self._send_json({"error": str(exc)}, 502)
            return
        if path == "/projetos":
            self._send_file(STATIC / "projects" / "index.html")
            return
        if path == "/":
            self._send_file(STATIC / "index.html")
            return
        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        target = (STATIC / path.lstrip("/")).resolve()
        if STATIC.resolve() not in target.parents and target != STATIC.resolve():
            self.send_error(403)
            return
        self._send_file(target)

    def do_POST(self) -> None:
        path = self._route_path()
        if path == "/api/projects":
            try:
                length = int(self.headers.get("Content-Length", "0") or "0")
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                name = str(payload.get("name", "")).strip()
                folder_path = str(payload.get("folderPath", "")).strip()
                if not name or not folder_path:
                    self._send_json({"error": "Informe o nome do projeto e o caminho da pasta."}, 400)
                    return
                if not Path(folder_path).is_dir():
                    self._send_json({"error": "O caminho informado não é uma pasta acessível pelo servidor."}, 400)
                    return
                projects = read_projects()
                project = {
                    "id": uuid.uuid4().hex,
                    "name": name,
                    "folderPath": folder_path,
                    "createdAt": datetime.now().isoformat(timespec="seconds"),
                }
                projects.append(project)
                write_projects(projects)
                self._send_json({**project, "dashboard": inspect_project(project)}, 201)
            except Exception as exc:
                self._send_json({"error": str(exc)}, 400)
            return

        if path != "/api/analyze":
            self.send_error(404)
            return

        file_item = _read_uploaded_file(self.headers, self.rfile)
        if file_item is None or not getattr(file_item, "filename", ""):
            self._send_json({"error": "Envie um arquivo .xlsx."}, 400)
            return

        suffix = Path(file_item.filename).suffix.lower()
        if suffix != ".xlsx":
            self._send_json({"error": "Formato inválido. Use .xlsx."}, 400)
            return

        target = UPLOADS / f"{uuid.uuid4().hex}.xlsx"
        with target.open("wb") as fh:
            fh.write(file_item.file.read())

        try:
            result = analyze(target)
            import_result = upsert_records(result["records"], f"excel:{Path(file_item.filename).name}")
            self._send_json(base_payload({"import_result": import_result}))
        except Exception as exc:
            self._send_json({"error": f"Não consegui processar o arquivo: {exc}"}, 500)

    def do_DELETE(self) -> None:
        path = self._route_path()
        if not path.startswith("/api/projects/"):
            self.send_error(404)
            return
        project_id = path.rsplit("/", 1)[-1]
        write_projects([project for project in read_projects() if str(project.get("id")) != project_id])
        self.send_response(204)
        self.end_headers()

    def _route_path(self) -> str:
        path = urlparse(self.path).path
        if BASE_PATH and path == BASE_PATH:
            return "/"
        if BASE_PATH and path.startswith(f"{BASE_PATH}/"):
            return path[len(BASE_PATH) :]
        return path


def main() -> None:
    init_db()
    start_background_sync()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"E-Cargo upload dashboard: http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
