"""ETL Python para consolidar o Fluxo de Caixa da JLE Telecom (equivalente a update_dashboard.ps1)."""

import datetime
import json
import os
import re
import shutil
import unicodedata
from pathlib import Path
import openpyxl


ROOT = Path(__file__).resolve().parent
LOCAL_TEMP = ROOT / "temp_read.xlsx"
FALLBACK = ROOT / "local_file.xlsx"
OUTPUT_JS = ROOT / "data.js"

CANDIDATE_DIRS = [
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO\PLANILHAS ANTIGAS"),
    Path("/mnt/jle/financeiro/Angelita/2026/FLUXO DIARIO"),
    Path("/mnt/jle/financeiro/Angelita/2026"),
    Path("/mnt/jle/financeiro/Angelita/2026/FLUXO DIARIO/PLANILHAS ANTIGAS"),
]

MONTH_MAP = {
    "JAN": "JANEIRO", "FEV": "FEVEREIRO", "MAR": "MARÇO", "ABR": "ABRIL",
    "MAI": "MAIO", "JUN": "JUNHO", "JUL": "JULHO", "AGO": "AGOSTO",
    "SET": "SETEMBRO", "OUT": "OUTUBRO", "NOV": "NOVEMBRO", "DEZ": "DEZEMBRO",
}


def normalize_str(val):
    if val is None:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(val))
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", stripped)


def parse_excel_date(val):
    if val is None:
        return ""
    if isinstance(val, datetime.datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, datetime.date):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        try:
            base = datetime.datetime(1899, 12, 30)
            return (base + datetime.timedelta(days=float(val))).strftime("%Y-%m-%d")
        except Exception:
            return str(val)
    return str(val).strip()


def parse_number(val):
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("R$", "").replace(" ", "")
    if not s or s == "-":
        return 0.0
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def find_source_file():
    found = []
    pattern = re.compile(r"Fluxo de Caixa Anal.*tico.*Atualizado.*\.xlsx$", re.IGNORECASE)
    for d in CANDIDATE_DIRS:
        if not d.exists():
            continue
        for f in d.iterdir():
            if not f.is_file():
                continue
            name = f.name
            if name.startswith("~$") or "TECONDRILL" in name.upper() or "TECNODRILL" in name.upper():
                continue
            if pattern.search(name):
                found.append(f)

    def sort_key(f):
        m = re.search(r"(\d{2})[-.](\d{2})[-.](\d{4})", f.name)
        dt = datetime.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else datetime.datetime.min
        return (dt, f.stat().st_mtime)

    if found:
        chosen = sorted(found, key=sort_key, reverse=True)[0]
        print(f"Arquivo de rede encontrado: {chosen}")
        shutil.copy2(chosen, LOCAL_TEMP)
        shutil.copy2(chosen, FALLBACK)
        return LOCAL_TEMP, chosen
    if FALLBACK.exists():
        print(f"Usando cache local fallback: {FALLBACK}")
        return FALLBACK, FALLBACK
    raise FileNotFoundError("Planilha Fluxo de Caixa Analítico_Atualizado*.xlsx não encontrada.")


def run():
    use_file, _ = find_source_file()
    wb = openpyxl.load_workbook(use_file, data_only=True, read_only=True)

    categorias_entrada = []
    categorias_saida = []
    tipos_transacao = []

    if "Origem de Dados " in wb.sheetnames:
        orig = wb["Origem de Dados "]
        for idx, row in enumerate(orig.iter_rows(values_only=True), 1):
            if idx < 2:
                continue
            ent = row[0] if len(row) > 0 else None
            sai = row[2] if len(row) > 2 else None
            tip = row[4] if len(row) > 4 else None
            if ent is not None and str(ent).strip():
                categorias_entrada.append(str(ent).strip())
            if sai is not None and str(sai).strip():
                categorias_saida.append(str(sai).strip())
            if tip is not None and str(tip).strip():
                tipos_transacao.append(str(tip).strip())

    all_transactions = []
    for sheet in wb.worksheets:
        name = sheet.title.strip()
        if name in ("Instrucoes", "Origem de Dados") or "2025" in name:
            continue

        banco = "Outros"
        if "BRADESCO" in name.upper():
            banco = "Bradesco"
        elif "CONFIAN" in name.upper():
            banco = "Sicoob Confiança"
        elif "MAXCREDITO" in name.upper() or "MAXICREDITO" in name.upper():
            banco = "Sicoob MaxiCrédito"
        elif "CARTAO" in name.upper() or "CARTÃO" in name.upper():
            banco = "Cartão de Crédito"

        rows = list(sheet.iter_rows(values_only=True))
        header_row_idx = -1
        for r_idx, row in enumerate(rows[:15]):
            norms = [normalize_str(v) for v in row]
            if "data" in norms and "entradasaida" in norms:
                header_row_idx = r_idx
                break

        if header_row_idx == -1:
            continue

        col_map = {}
        for c_idx, val in enumerate(rows[header_row_idx]):
            norm = normalize_str(val)
            if norm:
                col_map[norm] = c_idx

        is_layout_b = "remessa" in col_map
        m_mes = re.search(r"(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)", name)
        mes_aba = MONTH_MAP.get(m_mes.group(1), "N/D") if m_mes else "N/D"

        tx_count = 0
        empty_streak = 0
        data_idx = col_map.get("data")
        if data_idx is None:
            continue

        def get_cell(row, idx):
            return row[idx] if idx is not None and idx < len(row) else None

        for offset, row in enumerate(rows[header_row_idx + 1:], start=header_row_idx + 2):
            data_val = get_cell(row, data_idx)
            if data_val is None or str(data_val).strip() == "":
                empty_streak += 1
                if empty_streak >= 3:
                    break
                continue
            empty_streak = 0

            data_str = parse_excel_date(data_val)

            remessa = "MANUAL"
            if is_layout_b and "remessa" in col_map:
                t = get_cell(row, col_map["remessa"])
                if t is not None:
                    remessa = str(t).strip().upper()

            competencia = mes_aba
            if is_layout_b and "competencia" in col_map:
                t = get_cell(row, col_map["competencia"])
                if t is not None:
                    competencia = str(t).strip().upper()

            if competencia not in ("N/D", "") and "/" not in competencia:
                ano_tx = ""
                m1 = re.match(r"^(\d{4})-", data_str)
                m2 = re.search(r"/(20\d{2}|19\d{2})$", data_str)
                m3 = re.search(r"(20\d{2}|19\d{2})", name)
                if m1:
                    ano_tx = m1.group(1)
                elif m2:
                    ano_tx = m2.group(1)
                elif m3:
                    ano_tx = m3.group(1)
                if ano_tx:
                    competencia = f"{competencia}/{ano_tx}"

            uf = "N/D"
            if is_layout_b and "uf" in col_map:
                t = get_cell(row, col_map["uf"])
                if t is not None:
                    uf = str(t).strip().upper()

            fluxo = "N/D"
            if "entradasaida" in col_map:
                t = get_cell(row, col_map["entradasaida"])
                if t is not None:
                    fluxo = str(t).strip()

            categoria = "Outros"
            for h in ("movimento", "receitasdespesas", "fornecedores", "d"):
                if h in col_map:
                    t = get_cell(row, col_map[h])
                    if t is not None:
                        categoria = str(t).strip()
                    break

            descricao = ""
            for h in ("descricao", "detalhamento", "coluna1"):
                if h in col_map:
                    t = get_cell(row, col_map[h])
                    if t is not None:
                        descricao = str(t).strip()
                    break

            valor_nominal = 0.0
            if "rvalores" in col_map:
                valor_nominal = parse_number(get_cell(row, col_map["rvalores"]))

            meio_pagamento = "Outros"
            if "tipotransacao" in col_map:
                t = get_cell(row, col_map["tipotransacao"])
                if t is not None:
                    meio_pagamento = str(t).strip()
                    if meio_pagamento.upper() == "PIX":
                        meio_pagamento = "Pix"

            valor_liquido = -valor_nominal if fluxo == "Saída" else valor_nominal
            is_transfer = categoria == "Transferência entre contas"
            is_application = "aplica" in categoria.lower()

            all_transactions.append({
                "id": f"{name}_{offset}",
                "banco": banco,
                "aba": name,
                "remessa": remessa,
                "competencia": competencia,
                "data": data_str,
                "uf": uf,
                "fluxo": fluxo,
                "categoria": categoria,
                "descricao": descricao,
                "valor_nominal": round(valor_nominal, 2),
                "valor_liquido": round(valor_liquido, 2),
                "meio_pagamento": meio_pagamento,
                "is_transfer": is_transfer,
                "is_application": is_application,
            })
            tx_count += 1

        print(f"Aba {name}: {tx_count} transacoes reais extraidas.")

    wb.close()

    payload = {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "categories_origin": {
            "entradas": categorias_entrada,
            "saidas": categorias_saida,
            "tipos": tipos_transacao,
        },
        "transactions": all_transactions,
    }
    OUTPUT_JS.write_text("window.CASH_FLOW_DATA = " + json.dumps(payload, ensure_ascii=False) + ";", encoding="utf-8")
    print(f"ETL Finalizado! Dados salvos em data.js com {len(all_transactions)} lancamentos.")

    if LOCAL_TEMP.exists():
        LOCAL_TEMP.unlink()


if __name__ == "__main__":
    run()
