#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
BI JLE TELECOM - ETL ENGENHARIA CLARO PARANÁ
Fonte: \\10.121.21.252\medicoes\Filial PR\Claro\Engenharia\MEDIÇOES ORÇAMENTOS ENGENHARIA PR\Controle DE OBRAS - PR.xlsx
Destino: engenharia_data.js (window.ENGENHARIA_DATA e window.ENGENHARIA_METADATA)
Contingência: engenharia_local.xlsx
"""

import os
import sys
import re
import json
import shutil
import datetime
from collections import defaultdict, Counter
import openpyxl

# Diretório base do script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Diretórios candidatos de rede (com fallback resiliente)
CANDIDATE_DIRS = [
    r"\\10.121.21.252\medicoes\Filial PR\Claro\Engenharia\MEDIÇOES ORÇAMENTOS ENGENHARIA PR",
    r"\\10.121.21.252\medicoes\Filial PR\Claro\Engenharia",
    BASE_DIR
]

LOCAL_CACHE_FILE = os.path.join(BASE_DIR, "engenharia_local.xlsx")
OUTPUT_JS_FILE = os.path.join(BASE_DIR, "engenharia_data.js")

# Mapeamento auxiliar de cidades por código de site do Paraná
PREFIX_CITY_MAP = {
    "PRCSF": "CURITIBA",
    "PRCC": "CURITIBA",
    "PRCPH": "CURITIBA",
    "PRCBX": "COLOMBO",
    "PRSJP": "SÃO JOSÉ DOS PINHAIS",
    "PRCSC": "CASCAVEL",
    "PRTOO": "TOLEDO",
    "PRMGA": "MARINGÁ",
    "PRLDA": "LONDRINA",
    "PRPGO": "PONTA GROSSA",
    "PRGRP": "GUARAPUAVA",
    "PRCAB": "CAMBÉ",
    "PRFOZ": "FOZ DO IGUAÇU",
    "PRPQA": "PIRAQUARA",
    "PRFZR": "FAZENDA RIO GRANDE",
    "PRUMR": "UMUARAMA",
    "PRRLA": "ROLÂNDIA",
    "PRAPS": "ARAPONGAS",
    "PRCPM": "CAMPO MOURÃO",
    "PRPVA": "PARANAVAÍ",
    "PRQBS": "QUATRO BARRAS",
    "PRRON": "RIO NEGRO",
    "PRASD": "ASSIS CHATEAUBRIAND",
    "PRPLM": "PALMAS",
    "PRMOS": "MATINHOS",
    "PRNEA": "NOVA ESPERANÇA",
    "PRIRI": "IRATI",
    "PRPDT": "PRUDENTÓPOLIS",
    "PRCNE": "CIANORTE",
    "PRPNG": "PARANAGUÁ"
}

def find_source_file():
    """Localiza o arquivo mais recente de Controle de Obras ou usa o cache local."""
    target_names = ["Controle DE OBRAS - PR.xlsx", "Controle DE OBRAS - PR*.xlsx"]
    
    for c_dir in CANDIDATE_DIRS:
        if os.path.exists(c_dir):
            try:
                for fname in os.listdir(c_dir):
                    if fname.startswith("~$"):
                        continue
                    if "CONTROLE DE OBRAS" in fname.upper() and fname.endswith(".xlsx"):
                        fpath = os.path.join(c_dir, fname)
                        if os.path.isfile(fpath) and os.path.getsize(fpath) > 10000:
                            print(f"[ETL Engenharia] Arquivo de rede encontrado: {fpath}")
                            # Atualiza cache local
                            try:
                                shutil.copy2(fpath, LOCAL_CACHE_FILE)
                                print(f"[ETL Engenharia] Cache de contingência atualizado: {LOCAL_CACHE_FILE}")
                            except Exception as ce:
                                print(f"[ETL Engenharia] Aviso ao atualizar cache local: {ce}")
                            return fpath
            except Exception as e:
                print(f"[ETL Engenharia] Aviso ao escanear diretório {c_dir}: {e}")
                
    # Fallback para o cache local
    if os.path.exists(LOCAL_CACHE_FILE) and os.path.getsize(LOCAL_CACHE_FILE) > 10000:
        print(f"[ETL Engenharia] Usando cache local de contingência: {LOCAL_CACHE_FILE}")
        return LOCAL_CACHE_FILE
        
    raise FileNotFoundError("[ETL Engenharia] Nenhum arquivo de Controle de Obras foi encontrado na rede ou no cache local.")

def parse_val(v):
    """Converte valor financeiro com tratamento pt-BR e numérico."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).strip().replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except:
        return 0.0

def parse_date(v):
    """Formata datas para YYYY-MM-DD."""
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s or s.lower() in ("none", "null", "-", "na", "n/a"):
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except:
            pass
    # Se for apenas string com data aproximada
    return s[:10] if len(s) >= 10 and (s[4] == '-' or s[2] == '/') else s

def extract_site(solic, site_val):
    """Garante que o código do Site seja recuperado mesmo se estiver na coluna Solicitação."""
    s_site = str(site_val).strip() if site_val is not None else ""
    if s_site and s_site.upper() not in ("NONE", "NULL", "-", "FORMATAÇÃO"):
        return s_site.upper()
    
    # Procura na solicitação por padrão de código de site Claro PR
    m = re.search(r'\b(PR[A-Z0-9]{4,7})\b', str(solic).upper())
    if m:
        return m.group(1)
    return s_site.upper() or "PR-SITE"

def infer_city(site, city_val):
    """Preenche a cidade pelo prefixo do site se vazia."""
    c = str(city_val).strip() if city_val is not None else ""
    if c and c.upper() not in ("NONE", "NULL", "-", ""):
        return c.upper()
        
    s = str(site).upper()
    for prefix, city in PREFIX_CITY_MAP.items():
        if s.startswith(prefix):
            return city
    return "OUTROS - PR"

def classify_os_status(row_dict):
    """Classifica o status operacional exato de uma OS."""
    st_wf = str(row_dict.get('st_wf') or "").strip().upper()
    dt_wf_fn = row_dict.get('dt_wf_fn')
    dt_env_fn = row_dict.get('dt_env_fn')
    om_fn = str(row_dict.get('om_fn') or "").strip()
    v_fn = row_dict.get('v_fn', 0.0)

    # Parcial 3
    st_p3 = str(row_dict.get('st_p3') or "").strip().upper()
    dt_wf_p3 = row_dict.get('dt_wf_p3')
    om_p3 = str(row_dict.get('om_p3') or "").strip()
    v_p3 = row_dict.get('v_p3', 0.0)

    # Parcial 2
    st_p2 = str(row_dict.get('st_p2') or "").strip().upper()
    dt_wf_p2 = row_dict.get('dt_wf_p2')
    om_p2 = str(row_dict.get('om_p2') or "").strip()
    v_p2 = row_dict.get('v_p2', 0.0)

    # Parcial 1
    st_p1 = str(row_dict.get('st_p1') or "").strip().upper()
    dt_wf_p1 = row_dict.get('dt_wf_p1')
    om_p1 = str(row_dict.get('om_p1') or "").strip()
    v_p1 = row_dict.get('v_p1', 0.0)

    # Orçamento
    om_orc = str(row_dict.get('om_orc') or "").strip()
    dt_aprov_orc = row_dict.get('dt_aprov_orc')
    aprov_orc = str(row_dict.get('aprov_orc') or "").strip().lower()
    dt_env_orc = row_dict.get('dt_env_orc')
    dt_solic_orc = row_dict.get('dt_solic_orc')

    # Regras hierárquicas da esteira de aprovação
    if "FINALIZAD" in st_wf or dt_wf_fn:
        return "Finalizado"
    if om_fn or dt_env_fn or v_fn > 0:
        return "Medição Final Enviada"
    if om_p3 or v_p3 > 0:
        return "Parcial 3 Aprovada" if ("FINALIZAD" in st_p3 or dt_wf_p3) else "Parcial 3 Enviada"
    if om_p2 or v_p2 > 0:
        return "Parcial 2 Aprovada" if ("FINALIZAD" in st_p2 or dt_wf_p2) else "Parcial 2 Enviada"
    if om_p1 or v_p1 > 0:
        return "Parcial 1 Aprovada" if ("FINALIZAD" in st_p1 or dt_wf_p1) else "Parcial 1 Enviada"
    if om_orc or dt_aprov_orc or (aprov_orc and "solicitad" not in aprov_orc and aprov_orc != "-"):
        return "Orçamento Aprovado"
    if dt_env_orc:
        return "Orçamento Enviado Claro"
    if dt_solic_orc:
        return "Em Orçamento"
    return "Em Cadastro"

def classify_obra_status(os_list):
    """Calcula o status consolidado de uma Obra com base em todas as suas OSs."""
    statuses = set(os_item['status'] for os_item in os_list)
    
    if statuses == {'Finalizado'}:
        return "100% Finalizada"
    if 'Finalizado' in statuses:
        return "Parcialmente Concluída"
    if 'Medição Final Enviada' in statuses:
        return "Medição Final em Aprovação"
    if any(s.startswith('Parcial') for s in statuses):
        return "Em Andamento (Parciais)"
    if 'Orçamento Aprovado' in statuses:
        return "Orçamento Aprovado"
    if 'Orçamento Enviado Claro' in statuses:
        return "Orçamento Enviado Claro"
    return "Em Orçamento"

def calculate_aging_and_pendencia(dt_inicio, dt_ultima, status, is_os=False):
    """Calcula dias em aberto, dias sem movimentação, faixa de aging e próxima pendência/ação."""
    today = datetime.date.today()
    dias_aberto = 0
    dias_sem_mov = 0
    
    if dt_inicio:
        try:
            d_init = datetime.datetime.strptime(str(dt_inicio)[:10], "%Y-%m-%d").date()
            dias_aberto = max(0, (today - d_init).days)
        except:
            pass
            
    if dt_ultima:
        try:
            d_last = datetime.datetime.strptime(str(dt_ultima)[:10], "%Y-%m-%d").date()
            dias_sem_mov = max(0, (today - d_last).days)
        except:
            pass

    is_finalizada = ("Finalizad" in status)
    
    if is_finalizada:
        faixa = "Concluída"
        pendencia = "Concluída"
    elif dias_aberto <= 30:
        faixa = "Até 30 dias"
    elif dias_aberto <= 90:
        faixa = "31 a 90 dias"
    elif dias_aberto <= 180:
        faixa = "91 a 180 dias"
    else:
        faixa = "Mais de 180 dias"

    if not is_finalizada:
        if "Medição Final" in status:
            pendencia = "Claro: Aprovação Medição Final"
        elif "Orçamento Enviado" in status:
            pendencia = "Claro: Aprovação Orçamento"
        elif "Orçamento Aprovado" in status:
            pendencia = "JLE: Iniciar 1ª Medição"
        elif "Parcial" in status and "Concluída" not in status:
            pendencia = "JLE: Próxima Parcial / Final"
        elif "Parcialmente Concluída" in status:
            pendencia = "Misto: Validar OSs Pendentes"
        elif "Em Orçamento" in status:
            pendencia = "JLE: Enviar Orçamento Claro"
        else:
            pendencia = "Em Execução / Acompanhamento"

    return dias_aberto, dias_sem_mov, faixa, pendencia

def process_engenharia():
    source_file = find_source_file()
    print(f"[ETL Engenharia] Carregando dados de: {source_file}")
    
    wb = openpyxl.load_workbook(source_file, data_only=True, read_only=True)
    if 'Planilha1' not in wb.sheetnames:
        raise ValueError("[ETL Engenharia] Aba 'Planilha1' não encontrada na planilha.")
        
    ws = wb['Planilha1']
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    
    print(f"[ETL Engenharia] Total de linhas brutas na planilha: {len(rows)}")
    
    # Processa linhas de dados (iniciando na linha 3 / index 2)
    os_list = []
    obras_dict = defaultdict(list)
    
    for row_idx, r in enumerate(rows[2:], start=3):
        # Para ao encontrar linhas vazias no final
        if not r or not any(r):
            continue
        solic = str(r[0]).strip() if len(r) > 0 and r[0] is not None else ""
        if not solic:
            # Se nem solicitação nem site existirem, ignora
            if len(r) <= 1 or r[1] is None:
                continue
            solic = f"OBRA-{row_idx}"
            
        site_raw = r[1] if len(r) > 1 else ""
        cidade_raw = r[2] if len(r) > 2 else ""
        
        site = extract_site(solic, site_raw)
        cidade = infer_city(site, cidade_raw)
        
        # Datas do ciclo de vida
        dt_solic_orc = parse_date(r[3]) if len(r) > 3 else None
        dt_env_orc = parse_date(r[4]) if len(r) > 4 else None
        aprov_orc = str(r[5]).strip() if len(r) > 5 and r[5] is not None else None
        om_orc = str(r[6]).strip() if len(r) > 6 and r[6] is not None else None
        v_orc = parse_val(r[7]) if len(r) > 7 else 0.0
        dt_aprov_orc = parse_date(r[8]) if len(r) > 8 else None
        
        # Parcial 1
        om_p1 = str(r[9]).strip() if len(r) > 9 and r[9] is not None else None
        dt_env_p1 = parse_date(r[10]) if len(r) > 10 else None
        v_p1 = parse_val(r[11]) if len(r) > 11 else 0.0
        dt_wf_p1 = parse_date(r[12]) if len(r) > 12 else None
        st_p1 = str(r[13]).strip() if len(r) > 13 and r[13] is not None else None
        
        # Parcial 2
        om_p2 = str(r[14]).strip() if len(r) > 14 and r[14] is not None else None
        dt_env_p2 = parse_date(r[15]) if len(r) > 15 else None
        v_p2 = parse_val(r[16]) if len(r) > 16 else 0.0
        dt_wf_p2 = parse_date(r[17]) if len(r) > 17 else None
        st_p2 = str(r[18]).strip() if len(r) > 18 and r[18] is not None else None
        
        # Parcial 3
        om_p3 = str(r[19]).strip() if len(r) > 19 and r[19] is not None else None
        dt_env_p3 = parse_date(r[20]) if len(r) > 20 else None
        v_p3 = parse_val(r[21]) if len(r) > 21 else 0.0
        dt_wf_p3 = parse_date(r[22]) if len(r) > 22 else None
        st_p3 = str(r[23]).strip() if len(r) > 23 and r[23] is not None else None
        
        # Final / Entroncamento
        om_fn = str(r[24]).strip() if len(r) > 24 and r[24] is not None else None
        dt_env_fn = parse_date(r[25]) if len(r) > 25 else None
        v_fn = parse_val(r[26]) if len(r) > 26 else 0.0
        dt_wf_fn = parse_date(r[27]) if len(r) > 27 else None
        st_wf = str(r[28]).strip() if len(r) > 28 and r[28] is not None else None
        
        # Totais medidos desta OS
        v_medido_os = round(v_p1 + v_p2 + v_p3 + v_fn, 2)
        saldo_os = round(max(0.0, v_orc - v_medido_os), 2)
        
        os_item = {
            'id': f"OS-{row_idx}",
            'row_num': row_idx,
            'obra': solic,
            'site': site,
            'cidade': cidade,
            'dt_solic_orc': dt_solic_orc,
            'dt_env_orc': dt_env_orc,
            'aprov_orc': aprov_orc,
            'om_orc': om_orc,
            'v_orc': v_orc,
            'dt_aprov_orc': dt_aprov_orc,
            # P1
            'om_p1': om_p1,
            'dt_env_p1': dt_env_p1,
            'v_p1': v_p1,
            'dt_wf_p1': dt_wf_p1,
            'st_p1': st_p1,
            # P2
            'om_p2': om_p2,
            'dt_env_p2': dt_env_p2,
            'v_p2': v_p2,
            'dt_wf_p2': dt_wf_p2,
            'st_p2': st_p2,
            # P3
            'om_p3': om_p3,
            'dt_env_p3': dt_env_p3,
            'v_p3': v_p3,
            'dt_wf_p3': dt_wf_p3,
            'st_p3': st_p3,
            # Final
            'om_fn': om_fn,
            'dt_env_fn': dt_env_fn,
            'v_fn': v_fn,
            'dt_wf_fn': dt_wf_fn,
            'st_wf': st_wf,
            # Calculados
            'v_medido': v_medido_os,
            'saldo': saldo_os
        }
        
        os_st = classify_os_status(os_item)
        os_item['status'] = os_st
        
        # Datas de início e movimentação da OS
        os_start_dates = [d for d in (dt_solic_orc, dt_env_orc, dt_aprov_orc, dt_env_p1, dt_env_p2, dt_env_p3, dt_env_fn) if d]
        os_all_dates = os_start_dates + [d for d in (dt_wf_p1, dt_wf_p2, dt_wf_p3, dt_wf_fn) if d]
        dt_inicio_os = min(os_start_dates) if os_start_dates else None
        dt_ultima_os = max(os_all_dates) if os_all_dates else None
        
        d_aberto_os, d_sem_mov_os, faixa_os, pend_os = calculate_aging_and_pendencia(dt_inicio_os, dt_ultima_os, os_st, is_os=True)
        os_item['dt_inicio'] = dt_inicio_os
        os_item['ultima_movimentacao'] = dt_ultima_os
        os_item['dias_aberto'] = d_aberto_os
        os_item['dias_sem_mov'] = d_sem_mov_os
        os_item['faixa_aging'] = faixa_os
        os_item['pendencia'] = pend_os
        os_item['is_em_aberto'] = (os_st != 'Finalizado')

        os_list.append(os_item)
        obras_dict[solic].append(os_item)

    print(f"[ETL Engenharia] Total de OSs processadas: {len(os_list)}")
    print(f"[ETL Engenharia] Total de Obras únicas identificadas: {len(obras_dict)}")

    # Compila lista consolidada de Obras
    obras_consolidated = []
    all_cidades = set()
    all_status_obras = set()
    all_status_oss = set()
    
    total_orcado_global = 0.0
    total_medido_global = 0.0
    total_p1_global = 0.0
    total_p2_global = 0.0
    total_p3_global = 0.0
    total_fn_global = 0.0

    for idx, (obra_nome, items) in enumerate(obras_dict.items(), start=1):
        v_orc_total = round(sum(it['v_orc'] for it in items), 2)
        v_p1_total = round(sum(it['v_p1'] for it in items), 2)
        v_p2_total = round(sum(it['v_p2'] for it in items), 2)
        v_p3_total = round(sum(it['v_p3'] for it in items), 2)
        v_fn_total = round(sum(it['v_fn'] for it in items), 2)
        v_medido_total = round(v_p1_total + v_p2_total + v_p3_total + v_fn_total, 2)
        saldo_total = round(max(0.0, v_orc_total - v_medido_total), 2)
        pct_executado = round((v_medido_total / v_orc_total * 100) if v_orc_total > 0 else (100.0 if v_medido_total > 0 else 0.0), 1)

        sites = sorted(list(set(it['site'] for it in items if it['site'])))
        cidades = sorted(list(set(it['cidade'] for it in items if it['cidade'])))
        cidade_principal = cidades[0] if cidades else "CURITIBA"
        for c in cidades:
            all_cidades.add(c)
            
        status_consolidado = classify_obra_status(items)
        all_status_obras.add(status_consolidado)
        for it in items:
            all_status_oss.add(it['status'])

        # Datas consolidadas da Obra
        all_start_dates = [it['dt_inicio'] for it in items if it.get('dt_inicio')]
        all_activity_dates = [it['ultima_movimentacao'] for it in items if it.get('ultima_movimentacao')]
        dt_inicio_obra = min(all_start_dates) if all_start_dates else None
        dt_ultima_obra = max(all_activity_dates) if all_activity_dates else None
        
        d_aberto_ob, d_sem_mov_ob, faixa_ob, pend_ob = calculate_aging_and_pendencia(dt_inicio_obra, dt_ultima_obra, status_consolidado, is_os=False)
        is_em_aberto_obra = (status_consolidado != '100% Finalizada')

        total_orcado_global += v_orc_total
        total_medido_global += v_medido_total
        total_p1_global += v_p1_total
        total_p2_global += v_p2_total
        total_p3_global += v_p3_total
        total_fn_global += v_fn_total

        obras_consolidated.append({
            'id': f"OBRA-{idx:03d}",
            'nome': obra_nome,
            'qtd_os': len(items),
            'sites': sites,
            'cidade': cidade_principal,
            'cidades': cidades,
            'status': status_consolidado,
            'v_orc': v_orc_total,
            'v_p1': v_p1_total,
            'v_p2': v_p2_total,
            'v_p3': v_p3_total,
            'v_fn': v_fn_total,
            'v_medido': v_medido_total,
            'saldo': saldo_total,
            'pct_executado': pct_executado,
            'dt_inicio': dt_inicio_obra,
            'ultima_movimentacao': dt_ultima_obra,
            'dias_aberto': d_aberto_ob,
            'dias_sem_mov': d_sem_mov_ob,
            'faixa_aging': faixa_ob,
            'pendencia': pend_ob,
            'is_em_aberto': is_em_aberto_obra,
            'oss': items
        })

    total_orcado_global = round(total_orcado_global, 2)
    total_medido_global = round(total_medido_global, 2)
    saldo_global = round(max(0.0, total_orcado_global - total_medido_global), 2)
    pct_global = round((total_medido_global / total_orcado_global * 100) if total_orcado_global > 0 else 0.0, 1)

    # Contagem de status
    status_obras_counter = Counter(o['status'] for o in obras_consolidated)
    status_oss_counter = Counter(os_i['status'] for os_i in os_list)

    # Estatísticas de Aging e Obras em Aberto (Radar)
    open_obras_list = [o for o in obras_consolidated if o['is_em_aberto']]
    aging_dist = {
        'ate_30d': {
            'label': 'Até 30 dias',
            'count': len([o for o in open_obras_list if o['dias_aberto'] <= 30]),
            'saldo': round(sum(o['saldo'] for o in open_obras_list if o['dias_aberto'] <= 30), 2)
        },
        '31_a_90d': {
            'label': '31 a 90 dias',
            'count': len([o for o in open_obras_list if 30 < o['dias_aberto'] <= 90]),
            'saldo': round(sum(o['saldo'] for o in open_obras_list if 30 < o['dias_aberto'] <= 90), 2)
        },
        '91_a_180d': {
            'label': '91 a 180 dias',
            'count': len([o for o in open_obras_list if 90 < o['dias_aberto'] <= 180]),
            'saldo': round(sum(o['saldo'] for o in open_obras_list if 90 < o['dias_aberto'] <= 180), 2)
        },
        'mais_180d': {
            'label': 'Mais de 180 dias',
            'count': len([o for o in open_obras_list if o['dias_aberto'] > 180]),
            'saldo': round(sum(o['saldo'] for o in open_obras_list if o['dias_aberto'] > 180), 2)
        }
    }
    saldo_em_aberto = round(sum(o['saldo'] for o in open_obras_list), 2)
    media_dias_aberto = round(sum(o['dias_aberto'] for o in open_obras_list) / len(open_obras_list), 0) if open_obras_list else 0
    obras_criticas_aging = len([o for o in open_obras_list if o['dias_aberto'] > 90])

    summary = {
        'total_obras': len(obras_consolidated),
        'total_oss': len(os_list),
        'total_orcado': total_orcado_global,
        'total_medido': total_medido_global,
        'total_p1': round(total_p1_global, 2),
        'total_p2': round(total_p2_global, 2),
        'total_p3': round(total_p3_global, 2),
        'total_final': round(total_fn_global, 2),
        'saldo_a_medir': saldo_global,
        'pct_executado': pct_global,
        'obras_finalizadas': status_obras_counter.get('100% Finalizada', 0),
        'obras_em_andamento': len(obras_consolidated) - status_obras_counter.get('100% Finalizada', 0),
        'obras_em_aberto': len(open_obras_list),
        'saldo_em_aberto': saldo_em_aberto,
        'obras_criticas_aging': obras_criticas_aging,
        'obras_mais_180d': len([o for o in open_obras_list if o['dias_aberto'] > 180]),
        'media_dias_aberto': int(media_dias_aberto),
        'aging_distribution': aging_dist,
        'oss_finalizadas': status_oss_counter.get('Finalizado', 0),
        'status_obras_counts': dict(status_obras_counter),
        'status_oss_counts': dict(status_oss_counter)
    }

    metadata = {
        'generated_at': datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        'source_file': os.path.basename(source_file),
        'version': '1.0'
    }

    # Salva engenharia_data.js
    payload = {
        'summary': summary,
        'cidades': sorted(list(all_cidades)),
        'status_obras_list': sorted(list(all_status_obras)),
        'status_oss_list': sorted(list(all_status_oss)),
        'obras': obras_consolidated,
        'oss': os_list
    }

    js_content = f"""/**
 * BI JLE TELECOM - BASE DE DADOS: ENGENHARIA CLARO PARANÁ
 * Gerado automaticamente via update_engenharia.py em {metadata['generated_at']}
 * Fonte: {metadata['source_file']}
 */

window.ENGENHARIA_METADATA = {json.dumps(metadata, ensure_ascii=False, indent=2)};

window.ENGENHARIA_DATA = {json.dumps(payload, ensure_ascii=False, indent=2)};
"""

    with open(OUTPUT_JS_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"\n[ETL Engenharia] Sucesso! Arquivo JS gerado: {OUTPUT_JS_FILE}")
    print(f"[ETL Engenharia] Resumo: {summary['total_obras']} Obras | {summary['total_oss']} OSs | R$ {summary['total_orcado']:,.2f} Orçado | R$ {summary['total_medido']:,.2f} Medido")

if __name__ == "__main__":
    process_engenharia()
