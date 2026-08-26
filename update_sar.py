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
    
    # Selecionar a aba de dados do SAR (preferência 'Ext. MDU' ou 'SAR' ou primeira com COD.)
    sheet_name = None
    if "Ext. MDU" in wb.sheetnames:
        sheet_name = "Ext. MDU"
    elif "SAR" in wb.sheetnames:
        sheet_name = "SAR"
    else:
        sheet_name = wb.sheetnames[0]
        
    ws = wb[sheet_name]
    print(f"Processando aba: '{sheet_name}'")
    
    # Localizar a linha de cabeçalho
    header_row_idx = 4
    rows = []
    for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
        if r_idx < 15:
            row_str = [str(x).upper() if x is not None else "" for x in row]
            if "COD." in row_str or "CODIGO" in row_str or "AREA TECNICA" in row_str:
                header_row_idx = r_idx + 1
                print(f"Linha de cabeçalho detectada na linha {header_row_idx}")
                break
                
    # Reabrir iterador a partir da linha de cabeçalho
    records = []
    
    # Mapeamento de colunas padrão (baseado na estrutura do Ext. MDU):
    # Col 2 (B): COD.
    # Col 3 (C): AREA TECNICA
    # Col 4 (D): NODE
    # Col 5 (E): SITE
    # Col 6 (F): CIDADE
    # Col 7 (G): COMDOMÍNIO
    # Col 8 (H): ENDEREÇO
    # Col 9 (I): CAIXA MDU
    # Col 10 (J): MÊS
    # Col 11 (K): STATUS
    # Col 12 (L): Classe L
    # Col 13 (M): Classe F
    # Col 14 (N): Situação
    # Col 15 (O): Relatório Fotográfico
    # Col 16 (P): PROJETADO
    # Col 17 (Q): EXECUTADO
    # Col 18 (R): Serviço
    # Col 19 (S): Medição realizada
    # Col 20 (T): Data de entrada (Referência)
    # Col 21 (U): Inicio em
    # Col 22 (V): Previsão para
    # Col 23 (W): Data de Entrega
    # Col 24 (X): Relatorio PPT
    # Col 26 (Z): Status Medição
    # Col 27 (AA): Status Relatório
    # Col 28 (AB): Tempo (Dias)
    # Col 29 (AC): Prazo (SLA 3 dias)
    # Col 30 (AD): Atraso (Dias)

    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row_idx + 1, values_only=True)):
        if not row or len(row) < 2:
            continue
            
        cod = clean_str(row[1] if len(row) > 1 else None)
        if not cod:
            continue
            
        area_tecnica = clean_str(row[2] if len(row) > 2 else None)
        node = clean_str(row[3] if len(row) > 3 else None)
        site = clean_str(row[4] if len(row) > 4 else None)
        cidade = clean_str(row[5] if len(row) > 5 else None)
        condominio = clean_str(row[6] if len(row) > 6 else None)
        endereco = clean_str(row[7] if len(row) > 7 else None)
        caixa_mdu = clean_str(row[8] if len(row) > 8 else None)
        
        # Status da Obra (Col K / 11)
        status_obra_raw = clean_str(row[10] if len(row) > 10 else None)
        
        # Status Medição (Col Z / 26)
        status_medicao_raw = clean_str(row[25] if len(row) > 25 else None)
        
        # Status Relatório (Col AA / 27)
        status_relatorio = clean_str(row[26] if len(row) > 26 else None)
        
        # Status Geral (Coluna AB / 28)
        # Fórmula exata do Excel:
        # =SE(K5="SEM SINAL";"SEM SINAL";SE(K5="PARALISADO";"PARALISADO";SE(Z5="PENDENTE";"AG. MEDIÇÃO";SE(K5="CANCELADO";"CANCELADO";Z5))))
        status_k_upper = status_obra_raw.upper()
        status_z_upper = status_medicao_raw.upper()
        
        # Cálculo da Coluna AB (Status Geral)
        if "SEM SINAL" in status_k_upper:
            status = "SEM SINAL"
        elif "PARALISAD" in status_k_upper:
            status = "PARALISADO"
        elif "CANCELAD" in status_k_upper:
            status = "CANCELADO"
        elif "PEND" in status_z_upper or status_z_upper == "AG. MEDIÇÃO" or status_z_upper == "AG. MEDICAO":
            status = "AG. MEDIÇÃO"
        elif "RELAT" in status_z_upper or "AG." in status_z_upper:
            status = "AG. RELATÓRIO"
        elif "CONCLU" in status_z_upper or "CONCLU" in status_k_upper:
            status = "CONCLUÍDA"
        elif status_z_upper != "":
            status = status_z_upper
        else:
            status = "CONCLUÍDA"
            
        classe_l = clean_str(row[11] if len(row) > 11 else None)
        classe_f = clean_str(row[12] if len(row) > 12 else None)
        situacao = clean_str(row[13] if len(row) > 13 else None)
        relatorio_foto = clean_str(row[14] if len(row) > 14 else None)
        servico = clean_str(row[17] if len(row) > 17 else None)
        
        # Datas
        dt_entrada_iso = parse_date(row[19] if len(row) > 19 else None) # Col T (Data de Entrada)
        dt_inicio_iso = parse_date(row[20] if len(row) > 20 else None) # Col U (Inicio em)
        dt_previsao_iso = parse_date(row[21] if len(row) > 21 else None) # Col V (Previsao para)
        dt_entrega_iso = parse_date(row[22] if len(row) > 22 else None) # Col W (Data de Entrega)
        
        # Competência baseada na data de entrada
        competencia = get_competencia(dt_entrada_iso)
        
        # Detecção de colunas de Tempo, Prazo e Atraso (suporta formato com ou sem coluna AB física)
        val_col_27 = clean_str(row[27] if len(row) > 27 else None) # AB
        val_col_28 = clean_str(row[28] if len(row) > 28 else None) # AC
        val_col_29 = clean_str(row[29] if len(row) > 29 else None) # AD
        val_col_30 = clean_str(row[30] if len(row) > 30 else None) # AE
        
        # Se coluna AC tem prazo ("NO PRAZO" ou "ATRASADO"), então AB é tempo
        if "PRAZO" in val_col_28.upper() or "ATRASAD" in val_col_28.upper():
            tempo_dias = to_number(row[27] if len(row) > 27 else None)
            prazo_raw = val_col_28.upper()
            atraso_dias = to_number(row[29] if len(row) > 29 else None)
        else:
            # Caso AB seja Status Geral e AC seja Tempo, AD é Prazo e AE é Atraso
            tempo_dias = to_number(row[28] if len(row) > 28 else None)
            prazo_raw = val_col_29.upper()
            atraso_dias = to_number(row[30] if len(row) > 30 else None)
            
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
            "competencia": competencia,
            "ano": ano_entrada,
            "mes": mes_nome,
            "mes_num": mes_num,
            "status": status,
            "status_relatorio": status_relatorio,
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
