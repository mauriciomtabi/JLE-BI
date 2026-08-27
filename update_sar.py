#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_sar.py — Processador ETL para o Dashboard SAR do BI JLE Telecom
Lê a planilha do SAR (rede local ou cache local sar_local.xlsx)
e compila os dados normalizados em sar_data.js.
"""

import sys
import os
import json
import datetime
from collections import Counter
import openpyxl

# Meses em português
MESES_PT = [
    "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
]

def parse_date(val):
    """Converte valor para datetime ou string ISO 'YYYY-MM-DD'."""
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    val_str = str(val).strip()
    if not val_str or val_str == "-" or val_str.lower() == "none":
        return None
    
    # Formatos comuns: 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.datetime.strptime(val_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None

def format_date_br(iso_str):
    """Converte 'YYYY-MM-DD' para 'DD/MM/YYYY'."""
    if not iso_str:
        return "-"
    try:
        parts = iso_str.split("-")
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
    import unicodedata, re
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

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = None
    
    # Se passado via argumento
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        input_file = sys.argv[1]
    else:
        # Tenta temp -> cache local
        candidates = [
            os.path.join(base_dir, "Planilha_Operacional_SAR_JLE.xlsx"),
            os.path.join(base_dir, "sar_temp.xlsx"),
            os.path.join(base_dir, "sar_local.xlsx")
        ]
        for c in candidates:
            if os.path.exists(c):
                input_file = c
                break
                
    if not input_file:
        print("ERRO: Nenhum arquivo de entrada SAR encontrado!", file=sys.stderr)
        sys.exit(1)
        
    print(f"Lendo planilha SAR de: {input_file}")
    wb = openpyxl.load_workbook(input_file, data_only=True, read_only=True)
    
    # Selecionar a aba de dados do SAR (preferência 'SAR Operacional', 'Ext. MDU', 'SAR')
    sheet_name = None
    if "SAR Operacional" in wb.sheetnames:
        sheet_name = "SAR Operacional"
    elif "Ext. MDU" in wb.sheetnames:
        sheet_name = "Ext. MDU"
    elif "SAR" in wb.sheetnames:
        sheet_name = "SAR"
    else:
        sheet_name = wb.sheetnames[0]
        
    ws = wb[sheet_name]
    print(f"Processando aba: '{sheet_name}'")
    
    # Localizar a linha de cabeçalho
    header_row_idx = None
    for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
        if r_idx < 15:
            row_norm = [norm_h(x) for x in row if x is not None]
            # Ignora super-cabeçalhos de seção
            if any(x.startswith("ETAPA") for x in row_norm):
                continue
            # Detecta linha de cabeçalho (contém COD/CÓDIGO e CIDADE ou AREA)
            if any("COD" in x for x in row_norm) and any("CIDADE" in x or "AREA" in x for x in row_norm):
                header_row_idx = r_idx + 1
                print(f"Linha de cabeçalho detectada na linha {header_row_idx}")
                break
                
    if not header_row_idx:
        header_row_idx = 4
        print("Aviso: Linha de cabeçalho não encontrada dinamicamente, usando fallback linha 4.")
                
    # Construir mapa de cabeçalho dinâmico a partir da linha detectada
    header_map = {}
    for col_idx, cell in enumerate(ws.iter_rows(min_row=header_row_idx, max_row=header_row_idx, values_only=True).__next__(), start=0):
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
    
    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row_idx + 1, values_only=True)):
        if not row or len(row) < 2:
            continue
            
        cod = clean_str(get_col(row, "CODIGO SAR", "COD.", "CODIGO", "COD", default_idx=0))
        if not cod:
            # Fallback para coluna 1 se a coluna 0 estiver vazia
            cod = clean_str(get_col(row, default_idx=1))
        if not cod:
            continue
            
        area_tecnica = clean_str(get_col(row, "AREA TECNICA", "AREA", default_idx=2))
        node = clean_str(get_col(row, "NODE", default_idx=3))
        site = clean_str(get_col(row, "SITE", default_idx=4))
        cidade = clean_str(get_col(row, "CIDADE", default_idx=5))
        condominio = clean_str(get_col(row, "COMDOMINIO", "CONDOMINIO", default_idx=6))
        endereco = clean_str(get_col(row, "ENDERECO", default_idx=7))
        caixa_mdu = clean_str(get_col(row, "CAIXA MDU", default_idx=8))
        
        # Status da Obra / Operação
        status_obra_raw = clean_str(get_col(row, "STATUS OPERACAO", "STATUS", default_idx=10))
        
        # Colunas inseridas Y, Z, AA (Douglas)
        dt_medicao_iso = parse_date(get_col(row, "DATA MEDICAO", "DATA MEDIÇÃO", default_idx=24))
        num_wf = clean_str(get_col(row, "N WF", "NO WF", "NUM WF", "Nº WF", default_idx=25))
        status_wf = clean_str(get_col(row, "STATUS WF", default_idx=26))
        valor_medicao = to_number(get_col(row, "VALOR MEDICAO (R$)", "VALOR MEDICAO", "VALOR", default_idx=19))
        num_pedido = clean_str(get_col(row, "N DO PEDIDO / CONTRATO", "NO DO PEDIDO / CONTRATO", "NUMERO DO PEDIDO", "PEDIDO", default_idx=22))
        
        # Status Medição e Relatório
        status_medicao_raw = clean_str(get_col(row, "STATUS MEDICAO", default_idx=28))
        status_relatorio = clean_str(get_col(row, "STATUS RELATORIO", default_idx=29))
        
        # Status Geral
        status_geral_raw = clean_str(get_col(row, "STATUS GERAL SAR", "STATUS GERAL", default_idx=30))
        
        status_k_upper = status_obra_raw.upper()
        status_z_upper = status_medicao_raw.upper()
        status_g_upper = status_geral_raw.upper()
        
        if status_geral_raw:
            if "MEDIC" in status_g_upper and "CONCLU" in status_g_upper:
                status = "MEDIÇÃO CONCLUÍDA"
            elif "WF APROV" in status_g_upper or "CONCLU" in status_g_upper or "FINALIZAD" in status_g_upper:
                status = "MEDIÇÃO CONCLUÍDA"
            elif "SEM SINAL" in status_g_upper:
                status = "SEM SINAL"
            elif "PARALISAD" in status_g_upper:
                status = "PARALISADO"
            elif "CANCELAD" in status_g_upper:
                status = "CANCELADO"
            elif "RELAT" in status_g_upper or "AG. RELAT" in status_g_upper or "AG RELAT" in status_g_upper:
                status = "AG. RELATÓRIO"
            elif "AG. APROV" in status_g_upper or "AG APROV" in status_g_upper or "AG. MEDI" in status_g_upper or "AG MEDI" in status_g_upper or status_g_upper == "PENDENTE":
                status = "AG. MEDIÇÃO"
            else:
                status = status_geral_raw
        else:
            # Fallback de cálculo
            if "SEM SINAL" in status_k_upper:
                status = "SEM SINAL"
            elif "PARALISAD" in status_k_upper:
                status = "PARALISADO"
            elif "CANCELAD" in status_k_upper:
                status = "CANCELADO"
            elif "MEDIC" in status_z_upper and "CONCLU" in status_z_upper or "WF APROV" in status_z_upper or "CONCLU" in status_z_upper or "FINALIZAD" in status_z_upper:
                status = "MEDIÇÃO CONCLUÍDA"
            elif "RELAT" in status_z_upper or "AG. RELAT" in status_z_upper or "AG RELAT" in status_z_upper:
                status = "AG. RELATÓRIO"
            elif "AG. APROV" in status_z_upper or "AG APROV" in status_z_upper or "PEND" in status_z_upper or "AG. MEDI" in status_z_upper or "AG MEDI" in status_z_upper:
                status = "AG. MEDIÇÃO"
            elif status_z_upper != "":
                status = status_z_upper
            else:
                status = "MEDIÇÃO CONCLUÍDA"
            
        classe_l = clean_str(get_col(row, "EXECUTOR LINHA (CLASSE L)", "EXECUTOR LINHA", "CLASSE L", default_idx=11))
        classe_f = clean_str(get_col(row, "EXECUTOR FUSAO (CLASSE F)", "EXECUTOR FUSAO", "CLASSE F", default_idx=12))
        situacao = clean_str(get_col(row, "OBSERVACOES", "SITUACAO", default_idx=13))
        relatorio_foto = clean_str(get_col(row, "RELATORIO PPT / FOTOS", "RELATORIO FOTOGRAFICO", default_idx=14))
        servico = clean_str(get_col(row, "SERVICO / ESCOPO", "SERVICO", default_idx=17))
        
        # Datas
        dt_entrada_iso = parse_date(get_col(row, "DATA DE ENTRADA", default_idx=19))
        dt_inicio_iso = parse_date(get_col(row, "INICIO EM", default_idx=20))
        dt_previsao_iso = parse_date(get_col(row, "PREVISAO PARA", "PREVISAO", default_idx=21))
        dt_entrega_iso = parse_date(get_col(row, "DATA DE ENTREGA", default_idx=22))
        
        # Competência baseada na data de entrada
        competencia = get_competencia(dt_entrada_iso)
        
        # Tempo, Prazo e Atraso
        tempo_dias = to_number(get_col(row, "TEMPO (DIAS)", "TEMPO", default_idx=31))
        prazo_raw = clean_str(get_col(row, "PRAZO (SLA 3 DIAS)", "PRAZO", default_idx=32)).upper()
        atraso_dias = to_number(get_col(row, "ATRASO (DIAS)", "ATRASO", default_idx=33))
        
        if "NO PRAZO" in prazo_raw or "DENTRO" in prazo_raw:
            prazo = "NO PRAZO"
        elif "ATRASAD" in prazo_raw or "FORA" in prazo_raw:
            prazo = "ATRASADO"
        else:
            if tempo_dias > 3:
                prazo = "ATRASADO"
            elif tempo_dias > 0:
                prazo = "NO PRAZO"
            else:
                prazo = "NÃO INFORMADO"
                
        if prazo == "ATRASADO" and atraso_dias <= 0 and tempo_dias > 3:
            atraso_dias = tempo_dias - 3
            
        # Ano e Mês baseados na data de entrada
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
            "situacao": situacao,
            "relatorio_foto": relatorio_foto,
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
            "status_relatorio": status_relatorio,
            "status_medicao": status_medicao_raw,
            "status_obra": status_obra_raw,
            "prazo": prazo,
            "tempo_dias": tempo_dias,
            "atraso_dias": atraso_dias
        }
        records.append(record)
        
    print(f"Total de registros SAR extraídos: {len(records)}")
    
    # Extrair metadados e listas para filtros
    cidades = sorted(list(set(r["cidade"] for r in records if r["cidade"])))
    areas = sorted(list(set(r["area_tecnica"] for r in records if r["area_tecnica"])))
    status_list = sorted(list(set(r["status"] for r in records if r["status"])))
    prazos_list = ["NO PRAZO", "ATRASADO"]
    competencias = sorted(list(set(r["competencia"] for r in records if r["competencia"] and r["competencia"] != "NÃO INFORMADO")))
    anos = sorted(list(set(r["ano"] for r in records if r.get("ano") and r["ano"] != "NÃO INFORMADO")), reverse=True)
    meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    
    metadata = {
        "total_records": len(records),
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source_file": os.path.basename(input_file),
        "cidades": cidades,
        "areas_tecnicas": areas,
        "status_list": status_list,
        "prazos": prazos_list,
        "competencias": competencias,
        "anos": anos,
        "meses": meses
    }
    
    out_js = os.path.join(base_dir, "sar_data.js")
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("/**\n * sar_data.js — Base de Dados compilada do módulo SAR\n")
        f.write(f" * Gerado automaticamente em: {metadata['generated_at']}\n */\n\n")
        f.write(f"window.SAR_METADATA = {json.dumps(metadata, ensure_ascii=False, indent=2)};\n\n")
        f.write(f"window.SAR_DATA = {json.dumps(records, ensure_ascii=False, indent=2)};\n")
        
    print(f"Arquivo gerado com sucesso: {out_js}")

if __name__ == "__main__":
    main()
