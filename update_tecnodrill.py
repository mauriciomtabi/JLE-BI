"""ETL Python para consolidar Fluxo de Caixa Tecnodrill + Caixa Carlos/Denilson."""

import datetime
import json
import re
import shutil
import unicodedata
from pathlib import Path
import openpyxl


ROOT = Path(__file__).resolve().parent
LOCAL_TEMP = ROOT / "temp_tecnodrill.xlsx"
FALLBACK = ROOT / "tecnodrill_local.xlsx"
CAIXA_TEMP = ROOT / "temp_tecnodrill_caixa.xlsx"
CAIXA_FALLBACK = ROOT / "tecnodrill_caixa_local.xlsx"
OUTPUT_JS = ROOT / "tecnodrill_data.js"

PRIMARY_DIRS = [
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\FLUXO CAIXA"),
    Path("/mnt/jle/financeiro/Angelita/2026/TECNODRILL/FLUXO CAIXA"),
]
FALLBACK_DIRS = [
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO\PLANILHAS ANTIGAS"),
    Path("/mnt/jle/financeiro/Angelita/2026/FLUXO DIARIO"),
    Path("/mnt/jle/financeiro/Angelita/2026/TECNODRILL"),
    Path("/mnt/jle/financeiro/Angelita/2026/FLUXO DIARIO/PLANILHAS ANTIGAS"),
]
CAIXA_DIRS = [
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\CARLOS\CAIXA_BI"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\CARLOS"),
    Path(r"\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL"),
    Path("/mnt/jle/financeiro/Angelita/2026/TECNODRILL/CARLOS/CAIXA_BI"),
    Path("/mnt/jle/financeiro/Angelita/2026/TECNODRILL/CARLOS"),
    Path("/mnt/jle/financeiro/Angelita/2026/TECNODRILL"),
]

MONTH_MAP = {
    "JAN": "JANEIRO", "FEV": "FEVEREIRO", "MAR": "MARÇO", "ABR": "ABRIL",
    "MAI": "MAIO", "JUN": "JUNHO", "JUL": "JULHO", "AGOS": "AGOSTO", "AGO": "AGOSTO",
    "SET": "SETEMBRO", "OUT": "OUTUBRO", "NOV": "NOVEMBRO", "DEZ": "DEZEMBRO",
}
MONTH_NUM_TO_NAME = {
    1: "JANEIRO", 2: "FEVEREIRO", 3: "MARÇO", 4: "ABRIL",
    5: "MAIO", 6: "JUNHO", 7: "JULHO", 8: "AGOSTO",
    9: "SETEMBRO", 10: "OUTUBRO", 11: "NOVEMBRO", 12: "DEZEMBRO",
}
MONTH_NAME_TO_NUM = {v: f"{k:02d}" for k, v in MONTH_NUM_TO_NAME.items()}


def normalize_str(val):
    if val is None:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(val))
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", stripped)


def parse_excel_date(val):
    if val is None:
        return ""
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        try:
            return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(val))).strftime("%Y-%m-%d")
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


def get_caixa_category(desc, fluxo):
    if fluxo == "Entrada":
        return "Aporte de Caixa"
    d = str(desc or "").upper()
    if re.search(r"DIESEL|COMBUST|GASOLINA|POSTO|ALCOOL", d):
        return "Combustível"
    if re.search(r"REFEI|ALMO|JANTA|CAF|LANCH|CHURRAS|RESTAUR|PIZZ|XIS|PADARIA|ACAI|SORVETE", d):
        return "Alimentação"
    if re.search(r"HOTEL|HOSPEDAGEM|POUSADA|DIARIA", d):
        return "Hospedagem"
    if re.search(r"PEDAGIO|RODOVIARIA|EGR", d):
        return "Pedágio"
    if re.search(r"UBER|PASSAGEM|TRANSPORTE|DESLOCAMENTO", d):
        return "Transporte / Uber"
    if re.search(r"MANUTEN|VIDRO|AUTO CENTER|PNEU|CHAVE|MECANIC|PECA|OFICINA|COMPACTA", d):
        return "Manutenção Veicular"
    if re.search(r"EPI|CREDENCIAL|SEGURAN", d):
        return "EPIs e Segurança"
    if re.search(r"MOVEIS|COLCH|CAFETEIRA|MERCADO|HAVAN|LIMPEZA", d):
        return "Alojamento e Suprimentos"
    return "Outros e Diversos"


def parse_caixa_date(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d"), val.strftime("%d/%m/%Y"), val.month, val.year
    if isinstance(val, (int, float)):
        try:
            dt = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(val))
            return dt.strftime("%Y-%m-%d"), dt.strftime("%d/%m/%Y"), dt.month, dt.year
        except Exception:
            pass
    txt = str(val or "").strip()
    m = re.match(r"^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$", txt)
    if m:
        try:
            dt = datetime.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            return dt.strftime("%Y-%m-%d"), dt.strftime("%d/%m/%Y"), dt.month, dt.year
        except Exception:
            pass
    return "", txt, 0, 2026


def find_newest(dirs, filter_fn, temp_path, fallback_path):
    found = []
    for d in dirs:
        if not d.exists():
            continue
        for f in d.iterdir():
            if f.is_file() and f.suffix.lower() == ".xlsx" and not f.name.startswith("~$") and filter_fn(f.name):
                found.append(f)
    if found:
        chosen = sorted(found, key=lambda x: x.stat().st_mtime, reverse=True)[0]
        print(f"Arquivo selecionado: {chosen}")
        shutil.copy2(chosen, temp_path)
        shutil.copy2(chosen, fallback_path)
        return temp_path
    if fallback_path.exists():
        print(f"Usando cache local: {fallback_path}")
        return fallback_path
    return None


def run():
    def td_filter(name):
        u = name.upper()
        if "CONFER" in u or "REVISADO" in u:
            return False
        return bool(re.search(r"Fluxo de Caixa Anal.*tico TEC.*NDRILL.*\.xlsx$", name, re.IGNORECASE)) or "TECONDRILL" in u or "TECNODRILL" in u

    use_file = find_newest(PRIMARY_DIRS, td_filter, LOCAL_TEMP, FALLBACK)
    if not use_file:
        use_file = find_newest(FALLBACK_DIRS, td_filter, LOCAL_TEMP, FALLBACK)
    if not use_file:
        raise FileNotFoundError("Planilha Tecnodrill não encontrada.")

    wb = openpyxl.load_workbook(use_file, data_only=True, read_only=False)
    categorias_entrada, categorias_saida, tipos_transacao = [], [], []

    for ws in wb.worksheets:
        if "origem" in ws.title.lower():
            for r in range(2, ws.max_row + 1):
                ent = ws.cell(r, 2).value
                sai = ws.cell(r, 4).value
                tip = ws.cell(r, 6).value
                if ent is not None and str(ent).strip():
                    categorias_entrada.append(str(ent).strip())
                if sai is not None and str(sai).strip():
                    categorias_saida.append(str(sai).strip())
                if tip is not None and str(tip).strip():
                    tipos_transacao.append(str(tip).strip())
            break

    all_transactions = []
    for sheet in wb.worksheets:
        name = sheet.title.strip()
        if "TECNODRILL" not in name.upper() or "2025" in name:
            continue

        m_mes = re.search(r"(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGOS|AGO|SET|OUT|NOV|DEZ)", name)
        mes_aba = MONTH_MAP.get(m_mes.group(1), "N/D") if m_mes else "N/D"
        m_ano = re.search(r"(20\d{2})", name)
        ano_aba = m_ano.group(1) if m_ano else ""
        comp_aba = f"{mes_aba}/{ano_aba}" if (mes_aba != "N/D" and ano_aba) else mes_aba

        total_rows, total_cols = sheet.max_row, sheet.max_column
        header_row = -1
        for r in range(1, min(16, total_rows + 1)):
            has_data = any(normalize_str(sheet.cell(r, c).value) == "data" for c in range(1, total_cols + 1))
            has_fluxo = any("entrada" in normalize_str(sheet.cell(r, c).value) for c in range(1, total_cols + 1))
            if has_data and has_fluxo:
                header_row = r
                break
        if header_row == -1:
            continue

        col_map = {normalize_str(sheet.cell(header_row, c).value): c for c in range(1, total_cols + 1) if normalize_str(sheet.cell(header_row, c).value)}
        month_num = MONTH_NAME_TO_NUM.get(mes_aba, "01")
        last_valid_date = f"{ano_aba}-{month_num}-01" if ano_aba else "2026-01-01"

        u_name = name.upper()
        banco_aba = "Sicoob MaxiCrédito"
        if "BRADESCO" in u_name:
            banco_aba = "Bradesco"
        elif "CONFIA" in u_name:
            banco_aba = "Sicoob Confiança"

        tx_count = 0
        for r in range(header_row + 1, total_rows + 1):
            fluxo = "N/D"
            for hk in ("entradasaida", "entradasada"):
                if hk in col_map:
                    t = sheet.cell(r, col_map[hk]).value
                    if t is not None:
                        fluxo = str(t).strip()
                    break

            valor_nominal = 0.0
            for hk in ("rvalores", "rsvalores", "valores"):
                if hk in col_map:
                    t = sheet.cell(r, col_map[hk]).value
                    if t is not None:
                        valor_nominal = parse_number(t)
                    break

            if valor_nominal == 0.0 and fluxo in ("N/D", ""):
                continue

            data_str = ""
            if "data" in col_map:
                dv = sheet.cell(r, col_map["data"]).value
                if dv is not None and str(dv).strip():
                    data_str = parse_excel_date(dv)
            if re.match(r"^\d{4}-\d{2}-\d{2}$", data_str):
                last_valid_date = data_str
            else:
                data_str = last_valid_date

            uf = "RS"
            if "uf" in col_map:
                t = sheet.cell(r, col_map["uf"]).value
                if t is not None and str(t).strip():
                    uf = str(t).strip().upper()

            categoria = "Outros"
            for hk in ("d", "movimento", "receitasdespesas", "categoria"):
                if hk in col_map:
                    t = sheet.cell(r, col_map[hk]).value
                    if t is not None and str(t).strip():
                        categoria = str(t).strip()
                        break

            descricao = ""
            for hk in ("coluna1", "descricao", "detalhamento"):
                if hk in col_map:
                    t = sheet.cell(r, col_map[hk]).value
                    if t is not None and str(t).strip():
                        descricao = str(t).strip()
                        break

            meio_pagamento = "Outros"
            for hk in ("tipotransacao", "tipotransao", "tipo"):
                if hk in col_map:
                    t = sheet.cell(r, col_map[hk]).value
                    if t is not None and str(t).strip():
                        meio_pagamento = str(t).strip()
                        if meio_pagamento.upper() == "PIX":
                            meio_pagamento = "Pix"
                        break

            valor_liquido = -valor_nominal if fluxo == "Saída" else valor_nominal
            all_transactions.append({
                "id": f"{name.replace(' ', '_')}_{r}",
                "banco": banco_aba,
                "aba": name,
                "remessa": "MANUAL",
                "competencia": comp_aba,
                "data": data_str,
                "uf": uf,
                "fluxo": fluxo,
                "categoria": categoria,
                "descricao": descricao,
                "valor_nominal": round(valor_nominal, 2),
                "valor_liquido": round(valor_liquido, 2),
                "meio_pagamento": meio_pagamento,
                "is_transfer": categoria == "Transferência entre contas",
            })
            tx_count += 1
        print(f"Aba {name}: {tx_count} transacoes extraidas.")

    wb.close()

    caixa_payload = {
        "gerado_em": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "carlos": [],
        "denilson": [],
    }
    use_caixa = find_newest(CAIXA_DIRS, lambda n: "CAIXA" in n.upper(), CAIXA_TEMP, CAIXA_FALLBACK)
    if use_caixa:
        cwb = openpyxl.load_workbook(use_caixa, data_only=True, read_only=False)
        for person in ("carlos", "denilson"):
            cws = next((s for s in cwb.worksheets if s.title.strip().upper() == person.upper()), None)
            if not cws:
                continue
            plist = []
            pidx = 0
            for r in range(5, cws.max_row + 1):
                dt_val = cws.cell(r, 2).value
                c_val = cws.cell(r, 3).value
                d_val = cws.cell(r, 4).value
                s_val = cws.cell(r, 5).value
                desc_val = cws.cell(r, 6).value
                desc_text = str(desc_val).strip() if desc_val is not None else ""
                if dt_val is None and not c_val and not d_val and not desc_text:
                    continue
                iso, fmt, mnum, yr = parse_caixa_date(dt_val)
                comp = f"{MONTH_NUM_TO_NAME[mnum]}/{yr}" if mnum > 0 else "OUTROS"
                cred = parse_number(c_val)
                deb = parse_number(d_val)
                saldo = parse_number(s_val)
                fluxo = "Entrada" if cred > 0 else "Saída"
                valor = cred if fluxo == "Entrada" else deb
                pidx += 1
                plist.append({
                    "id": f"{person}-{pidx}",
                    "linha": r,
                    "responsavel": "Carlos" if person == "carlos" else "Denilson",
                    "data": iso,
                    "data_fmt": fmt,
                    "competencia": comp,
                    "fluxo": fluxo,
                    "categoria": get_caixa_category(desc_text, fluxo),
                    "credito": round(cred, 2),
                    "debito": round(deb, 2),
                    "valor": round(valor, 2),
                    "saldo": round(saldo, 2),
                    "descricao": desc_text,
                })
            caixa_payload[person] = plist
            print(f"Caixa {person}: {len(plist)} lancamentos.")
        cwb.close()

    payload = {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "empresa": "Tecnodrill",
        "categories_origin": {
            "entradas": categorias_entrada,
            "saidas": categorias_saida,
            "tipos": tipos_transacao,
        },
        "transactions": all_transactions,
        "caixa": caixa_payload,
    }
    OUTPUT_JS.write_text("window.TECNODRILL_DATA = " + json.dumps(payload, ensure_ascii=False) + ";", encoding="utf-8")
    print(f"Tecnodrill ETL finalizado! {len(all_transactions)} lancamentos principais.")

    for tmp in (LOCAL_TEMP, CAIXA_TEMP):
        if tmp.exists():
            tmp.unlink()


if __name__ == "__main__":
    run()
