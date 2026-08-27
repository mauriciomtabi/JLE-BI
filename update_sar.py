#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_sar.py — Processador ETL para o Dashboard SAR do BI JLE Telecom
Lê a planilha oficial do SAR (Google Sheets em nuvem com fallback em rede/cache local)
e compila os dados normalizados em sar_data.js.
"""

import sys
import os
import io
import csv
import json
import datetime
import urllib.request
import unicodedata
import re
import openpyxl

GOOGLE_SHEET_ID = "1kQyIsIDmsnunTbHU46n_3FmeL8ddbGGHnXHo6FXAfq4"
GOOGLE_SHEET_GID = "1221770117"
GOOGLE_SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&gid={GOOGLE_SHEET_GID}"

# Meses em português
MESES_PT = [
    "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
]

def parse_date(val):
    """Converte valor para string ISO 'YYYY-MM-DD'."""
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    val_str = str(val).strip()
    if not val_str or val_str in ("-", "None", "none", "null", "N/A", "n/a", ""):
        return None
    
    # Formato DD/MM/YYYY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', val_str)
    if m:
        try:
            return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        except Exception:
            pass

    # Formato YYYY-MM-DD
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', val_str)
    if m:
        try:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        except Exception:
            pass

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.datetime.strptime(val_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None

def format_date_br(iso_str):
    """Converte 'YYYY-MM-DD' para 'DD/MM/YYYY'."""
    if not iso_str or len(iso_str) < 10:
        return "-"
    try:
        parts = iso_str[:10].split("-")
        if len(parts) == 3:
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        pass
    return str(iso_str)

def get_competencia(iso_date):
    """Retorna 'MÊS/ANO' a partir de 'YYYY-MM-DD'."""
    if not iso_date:
        return "NÃO INFORMADO"
    try:
        parts = iso_date.split("-")
        ano = parts[0]
        mes_num = int(parts[1])
        if 1 <= mes_num <= 12:
            return f"{MESES_PT[mes_num]}/{ano}"
    except Exception:
        pass
    return "NÃO INFORMADO"

def to_number(val):
    """Converte com segurança para float/int ou 0."""
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return round(float(val), 2)
    try:
        s = str(val).strip().replace(".", "").replace(",", ".")
        return round(float(s), 2)
    except Exception:
        return 0

def norm_h(text):
    """Normaliza texto de cabeçalho removendo acentos, pontuações e símbolos."""
    if not text:
        return ""
    s = str(text).strip().upper()
    s = s.replace('º', ' ').replace('ª', ' ').replace('°', ' ').replace('.', ' ')
    s = "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()

def clean_str(val):
    """Limpa e padroniza string."""
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() in ("none", "null", "-", "n/a") else s

def load_from_google_sheets(url):
    """Baixa e converte dados da planilha Google Sheets via export CSV."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode('utf-8')
            reader = csv.reader(io.StringIO(content))
            rows = list(reader)
            if rows and len(rows) > 3:
                return rows
    except Exception as e:
        print(f"Aviso ao acessar Google Sheets ({url}): {e}")
    return None

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rows = None
    source_desc = ""

    # 1. Tentar ler diretamente do Google Sheets
    print(f"Tentando sincronizar base SAR online do Google Sheets...")
    gs_url = os.environ.get("GOOGLE_SHEET_SAR_URL") or GOOGLE_SHEET_CSV_URL
    rows = load_from_google_sheets(gs_url)
    
    if rows:
        source_desc = f"Google Sheets ({GOOGLE_SHEET_ID})"
        print(f"[OK] Sucesso! {len(rows)} linhas baixadas do Google Sheets.")
        # Salvar cópia local de contingência em CSV
        try:
            cache_csv_path = os.path.join(base_dir, "sar_local.csv")
            with open(cache_csv_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerows(rows)
        except Exception:
            pass

    # 2. Fallback para arquivos locais (se Google Sheets falhar ou offline)
    if not rows:
        print("Buscando fontes locais / cache de contingência...")
        input_file = None
        if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
            input_file = sys.argv[1]
        else:
            candidates = [
                os.path.join(base_dir, "sar_local.csv"),
                os.path.join(base_dir, "Planilha_Operacional_SAR_JLE.xlsx"),
                os.path.join(base_dir, "sar_temp.xlsx"),
                os.path.join(base_dir, "sar_local.xlsx")
            ]
            for c in candidates:
                if os.path.exists(c):
                    input_file = c
                    break

        if input_file and input_file.endswith(".csv"):
            with open(input_file, "r", encoding="utf-8") as f:
                rows = list(csv.reader(f))
            source_desc = f"Cache CSV Local ({os.path.basename(input_file)})"
        elif input_file and input_file.endswith(".xlsx"):
            wb = openpyxl.load_workbook(input_file, data_only=True, read_only=True)
            sheet_name = "SAR Operacional" if "SAR Operacional" in wb.sheetnames else ("Ext. MDU" if "Ext. MDU" in wb.sheetnames else wb.sheetnames[0])
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))
            source_desc = f"Arquivo Excel ({os.path.basename(input_file)})"

    if not rows or len(rows) < 2:
        print("ERRO CRÍTICO: Não foi possível carregar dados do SAR.", file=sys.stderr)
        sys.exit(1)

    print(f"Processando dados da fonte: {source_desc}")

    # Localizar a linha de cabeçalho
    header_row_idx = None
    for r_idx, row in enumerate(rows[:15]):
        row_norm = [norm_h(x) for x in row if x is not None]
        if any(x.startswith("ETAPA") for x in row_norm):
            continue
        if any("COD" in x for x in row_norm) and any("CIDADE" in x or "AREA" in x or "ENTRADA" in x for x in row_norm):
            header_row_idx = r_idx
            print(f"Linha de cabeçalho detectada no índice {header_row_idx + 1}")
            break

    if header_row_idx is None:
        header_row_idx = 0 if len(rows[0]) > 10 else 2
        print(f"Usando cabeçalho padrão índice {header_row_idx + 1}")

    # Construir mapa de cabeçalho dinâmico
    header_map = {}
    header_cells = rows[header_row_idx]
    for col_idx, cell in enumerate(header_cells):
        if cell:
            n_key = norm_h(cell)
            header_map[n_key] = col_idx

    print(f"Colunas mapeadas dinamicamente: {len(header_map)}")

    def get_col(row, *aliases, default_idx=None):
        for a in aliases:
            n = norm_h(a)
            if n in header_map:
                idx = header_map[n]
                return row[idx] if idx < len(row) else None
        if default_idx is not None and default_idx < len(row):
            return row[default_idx]
        return None

    records = []
    today = datetime.date.today()

    for r_idx, row in enumerate(rows[header_row_idx + 1:], start=header_row_idx + 2):
        if not row or len(row) < 2:
            continue

        cod = clean_str(get_col(row, "CODIGO SAR", "CODIGO", "COD.", "COD", default_idx=0))
        cidade = clean_str(get_col(row, "CIDADE", "MUNICIPIO", default_idx=4))

        # REGRA FUNDAMENTAL: Descartar linhas de rascunho onde a Cidade está vazia
        if not cod or not cidade:
            continue

        area_tecnica = clean_str(get_col(row, "AREA TECNICA", "AREA", "AT", default_idx=1))
        node = clean_str(get_col(row, "NODE", "NO", default_idx=2))
        site = clean_str(get_col(row, "SITE", "LOCAL", default_idx=3))
        condominio = clean_str(get_col(row, "CONDOMINIO", "COMDOMINIO", "CLIENTE", "PREDIO", default_idx=5))
        endereco = clean_str(get_col(row, "ENDERECO", "LOGRADOURO", "RUA", default_idx=6))
        caixa_mdu = clean_str(get_col(row, "CAIXA MDU", "CX MDU", "CAIXA", default_idx=7))
        servico = clean_str(get_col(row, "SERVICO / ESCOPO", "SERVICO", "ESCOPO", default_idx=8))
        classe_l = clean_str(get_col(row, "EXECUTOR LINHA (CLASSE L)", "EXECUTOR (CLASSE L)", "EXECUTOR LINHA", "CLASSE L", default_idx=9))
        classe_f = clean_str(get_col(row, "EXECUTOR FUSAO (CLASSE F)", "EXECUTOR (CLASSE F)", "EXECUTOR FUSAO", "CLASSE F", default_idx=10))
        
        # Campos de Campo / Projeto
        projetado = clean_str(get_col(row, "PROJETADO", default_idx=11))
        executado = clean_str(get_col(row, "EXECUTADO", default_idx=12))
        observacao_op = clean_str(get_col(row, "OBSERVACAO", "OBSERVAÇÃO", "SITUACAO", default_idx=13))
        
        # Datas de Operação
        dt_entrada_iso = parse_date(get_col(row, "DATA ENTRADA", "DATA DE ENTRADA", "ENTRADA", default_idx=14))
        dt_inicio_iso = parse_date(get_col(row, "INICIO EM", "INÍCIO EM", "DATA INICIO", default_idx=15))
        dt_previsao_iso = parse_date(get_col(row, "PREVISAO", "PREVISÃO", "PREVISAO PARA", default_idx=16))
        dt_entrega_iso = parse_date(get_col(row, "DATA ENTREGA", "DATA DE ENTREGA", "ENTREGA", default_idx=17))
        relatorio_ppt = clean_str(get_col(row, "RELATORIO PPT", "RELATÓRIO PPT", "RELATORIO PPT / FOTOS", default_idx=18))
        data_envio_med = clean_str(get_col(row, "DATA ENVIO MEDICAO", "DATA ENVIO MEDIÇÃO", "MTA ENVIO MEDICAO", "ENVIO MEDICAO", default_idx=19))

        # Tempo, Prazo e Atraso (Colunas U, V, W / idx 20, 21, 22)
        tempo_raw = get_col(row, "TEMPO (DIAS)", "TEMPO DIAS", "TEMPO", default_idx=20)
        prazo_raw = clean_str(get_col(row, "PRAZO (SLA 3 DIAS)", "PRAZO SLA 3 DIAS", "PRAZO", "SLA", default_idx=21)).upper()
        atraso_raw = get_col(row, "ATRASO (DIAS)", "ATRASO DIAS", "ATRASO", default_idx=22)

        # Status Geral SAR (Coluna X / idx 23)
        status_geral_raw = clean_str(get_col(row, "STATUS STATUS GERAL SAR", "STATUS GERAL SAR", "STATUS GERAL", "STATUS", default_idx=23))
        sg_upper = status_geral_raw.upper()

        if "WF IMPLANT" in sg_upper or "CONCLU" in sg_upper or "FINALIZAD" in sg_upper:
            status = "MEDIÇÃO CONCLUÍDA"
        elif "ENVIAD" in sg_upper or "RELAT" in sg_upper:
            status = "AG. RELATÓRIO"
        elif "SEM SINAL" in sg_upper:
            status = "SEM SINAL"
        elif "PARALISAD" in sg_upper:
            status = "PARALISADO"
        elif "CANCELAD" in sg_upper:
            status = "CANCELADO"
        elif "EM MEDI" in sg_upper or "AG. MEDI" in sg_upper or "AG MEDI" in sg_upper or "ANDAMENTO" in sg_upper or "PENDENTE" in sg_upper:
            status = "AG. MEDIÇÃO"
        else:
            status = status_geral_raw if status_geral_raw else "AG. MEDIÇÃO"

        # Colunas de Medição & Faturamento (Douglas: Colunas Y, Z, AA, AB, AC)
        dt_medicao_iso = parse_date(get_col(row, "ETAPA 2: MEDICAO (PREENCHIMENTO: DOUGLAS) DATA MEDICAO", "DATA MEDICAO", "DATA MEDIÇÃO", default_idx=24))
        valor_medicao = to_number(get_col(row, "VALOR MEDICAO (R$)", "VALOR MEDICAO", "VALOR", default_idx=25))
        num_wf = clean_str(get_col(row, "N WF", "NO WF", "NUM WF", "Nº WF", "WORKFLOW", default_idx=26))
        num_pedido = clean_str(get_col(row, "N DO PEDIDO", "NO DO PEDIDO", "PEDIDO", default_idx=27))
        observacoes = clean_str(get_col(row, "OBSERVACOES", "OBSERVAÇÕES", "OBS", default_idx=28))
        status_wf = "100% - OK" if status == "MEDIÇÃO CONCLUÍDA" else ""

        # Cálculo do Tempo e SLA em dias úteis
        tempo_dias = to_number(tempo_raw)
        if tempo_dias <= 0 and dt_entrada_iso:
            try:
                import numpy as np
                d1 = datetime.datetime.strptime(dt_entrada_iso[:10], "%Y-%m-%d").date()
                d2 = None
                if dt_medicao_iso:
                    d2 = datetime.datetime.strptime(dt_medicao_iso[:10], "%Y-%m-%d").date()
                elif dt_entrega_iso:
                    d2 = datetime.datetime.strptime(dt_entrega_iso[:10], "%Y-%m-%d").date()
                elif "CONCLU" not in status.upper() and "CANCEL" not in status.upper():
                    d2 = today

                if d1 and d2:
                    if d2 >= d1:
                        tempo_dias = int(np.busday_count(d1, d2))
                    else:
                        tempo_dias = 0
            except Exception:
                pass

        if "NO PRAZO" in prazo_raw or "DENTRO" in prazo_raw:
            prazo = "NO PRAZO"
        elif "ATRASAD" in prazo_raw or "FORA" in prazo_raw:
            prazo = "ATRASADO"
        else:
            prazo = "ATRASADO" if tempo_dias > 3 else "NO PRAZO"

        atraso_dias = to_number(atraso_raw)
        if prazo == "ATRASADO" and atraso_dias <= 0 and tempo_dias > 3:
            atraso_dias = tempo_dias - 3
        elif prazo == "NO PRAZO":
            atraso_dias = 0

        # Competência e Períodos
        competencia = get_competencia(dt_entrada_iso)
        ano_entrada = dt_entrada_iso[:4] if dt_entrada_iso else "NÃO INFORMADO"
        mes_num = dt_entrada_iso[5:7] if dt_entrada_iso and len(dt_entrada_iso) >= 7 else ""
        mes_idx = int(mes_num) if mes_num.isdigit() and 1 <= int(mes_num) <= 12 else 0
        mes_nome = MESES_PT[mes_idx] if mes_idx > 0 else "NÃO INFORMADO"

        record = {
            "cod": cod,
            "area_tecnica": area_tecnica,
            "node": node,
            "site": site,
            "cidade": cidade,
            "condominio": condominio,
            "endereco": endereco,
            "caixa_mdu": caixa_mdu,
            "classe_l": classe_l,
            "classe_f": classe_f,
            "situacao": observacao_op or projetado,
            "relatorio_foto": executado,
            "servico": servico,
            "data_entrada": dt_entrada_iso,
            "data_entrada_fmt": format_date_br(dt_entrada_iso),
            "data_inicio": dt_inicio_iso,
            "data_inicio_fmt": format_date_br(dt_inicio_iso),
            "data_previsao": dt_previsao_iso,
            "data_previsao_fmt": format_date_br(dt_previsao_iso),
            "data_entrega": dt_entrega_iso,
            "data_entrega_fmt": format_date_br(dt_entrega_iso),
            "data_medicao": dt_medicao_iso,
            "data_medicao_fmt": format_date_br(dt_medicao_iso),
            "num_wf": num_wf,
            "status_wf": status_wf,
            "competencia": competencia,
            "ano": ano_entrada,
            "mes": mes_nome,
            "mes_num": mes_num,
            "status": status,
            "status_relatorio": relatorio_ppt,
            "status_medicao": data_envio_med,
            "status_obra": "Concluído Campo" if status == "MEDIÇÃO CONCLUÍDA" else "Em Andamento",
            "prazo": prazo,
            "tempo_dias": tempo_dias,
            "atraso_dias": atraso_dias
        }
        records.append(record)

    print(f"Total de registros operacionais válidos extraídos: {len(records)}")

    # Extrair metadados e listas para filtros
    cidades = sorted(list(set(r["cidade"] for r in records if r["cidade"])))
    areas = sorted(list(set(r["area_tecnica"] for r in records if r["area_tecnica"])))
    status_list = ["AG. MEDIÇÃO", "MEDIÇÃO CONCLUÍDA", "AG. RELATÓRIO", "CANCELADO", "SEM SINAL", "PARALISADO"]
    prazos_list = ["NO PRAZO", "ATRASADO"]
    competencias = sorted(list(set(r["competencia"] for r in records if r["competencia"] and r["competencia"] != "NÃO INFORMADO")))
    anos = sorted(list(set(r["ano"] for r in records if r.get("ano") and r["ano"] != "NÃO INFORMADO")), reverse=True)
    meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

    metadata = {
        "total_records": len(records),
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source_file": source_desc,
        "cidades": cidades,
        "areas_tecnicas": areas,
        "status_list": status_list,
        "prazos": prazos_list,
        "competencias": competencias,
        "anos": anos,
        "meses": meses
    }

    # Salvar sar_data.js
    output_js_path = os.path.join(base_dir, "sar_data.js")
    with open(output_js_path, "w", encoding="utf-8") as f:
        f.write(f"// Dados SAR JLE Telecom - Gerado em: {metadata['generated_at']}\n")
        f.write(f"// Fonte: {source_desc}\n")
        f.write("window.SAR_METADATA = " + json.dumps(metadata, ensure_ascii=False, indent=4) + ";\n\n")
        f.write("window.SAR_DATA = " + json.dumps(records, ensure_ascii=False, indent=2) + ";\n")

    print(f"Arquivo gerado com sucesso: {output_js_path}")

if __name__ == "__main__":
    main()
