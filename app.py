from __future__ import annotations

import json
import math
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, time as datetime_time
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import cgi

import pandas as pd


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
UPLOADS = ROOT / "work" / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
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
        self.send_response(200)
        self.send_header("Content-Type", content_types.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/fetch-222":
            params = parse_qs(urlparse(self.path).query)
            hours = int(params.get("hours", ["24"])[0] or "24")
            start_date = params.get("start", [None])[0]
            end_date = params.get("end", [None])[0]
            group_scope = params.get("scope", ["all"])[0]
            try:
                self._send_json(
                    fetch_222(hours=hours, start_date=start_date, end_date=end_date, group_scope=group_scope)
                )
            except Exception as exc:
                self._send_json({"error": str(exc)}, 502)
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
        if urlparse(self.path).path != "/api/analyze":
            self.send_error(404)
            return

        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        file_item = form["file"] if "file" in form else None
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
            self._send_json(analyze(target))
        except Exception as exc:
            self._send_json({"error": f"Não consegui processar o arquivo: {exc}"}, 500)


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"E-Cargo upload dashboard: http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
