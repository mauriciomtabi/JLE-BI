# -*- coding: utf-8 -*-
r"""
BI JLE Telecom - Módulo de Financiamentos & PMTs
Script ETL: Extração, Transformação e Carga das PMTs de Financiamentos
Lê as planilhas da Controladoria na rede:
\\10.121.21.252\controladoria\Vitor\FINANCEIRO\PMTs FINANCIAMENTOS
Gera:
- financiamentos_data.js (window.FINANCIAMENTOS_DATA)
- financiamentos_local/ (cópia local dos arquivos para contingência)
"""

import os
import sys
import json
import shutil
import datetime
import openpyxl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_CACHE_DIR = os.path.join(SCRIPT_DIR, "financiamentos_local")
OUTPUT_JS_FILE = os.path.join(SCRIPT_DIR, "financiamentos_data.js")

CANDIDATE_DIRS = [
    r"\\10.121.21.252\controladoria\Vitor\FINANCEIRO\PMTs FINANCIAMENTOS",
    r"\\10.121.21.252\controladoria\Vitor\FINANCEIRO",
    r"\\10.121.21.252\controladoria\FINANCEIRO\PMTs FINANCIAMENTOS",
    r"\\10.121.21.252\controladoria"
]

def ensure_cache_dir():
    if not os.path.exists(LOCAL_CACHE_DIR):
        os.makedirs(LOCAL_CACHE_DIR, exist_ok=True)

def find_network_folder():
    for c_dir in CANDIDATE_DIRS:
        if os.path.exists(c_dir):
            try:
                files = os.listdir(c_dir)
                if any("financiamento" in f.lower() for f in files):
                    return c_dir
            except Exception:
                pass
    return None

def sync_network_to_local(net_folder):
    ensure_cache_dir()
    if not net_folder or not os.path.exists(net_folder):
        return
    try:
        for f in os.listdir(net_folder):
            if f.startswith("~$") or not f.lower().endswith(".xlsx"):
                continue
            src = os.path.join(net_folder, f)
            dst = os.path.join(LOCAL_CACHE_DIR, f)
            try:
                # Copiar se não existir ou se modificado
                if not os.path.exists(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
                    shutil.copy2(src, dst)
            except Exception as e:
                print(f"[ETL] Aviso ao copiar {f}: {e}")
        print(f"[ETL] Cache local de contingência sincronizado com sucesso: {LOCAL_CACHE_DIR}")
    except Exception as e:
        print(f"[ETL] Erro na sincronização de contingência: {e}")

def get_active_folder():
    net_folder = find_network_folder()
    if net_folder and os.path.exists(net_folder):
        print(f"[ETL] Pasta de rede localizada: {net_folder}")
        sync_network_to_local(net_folder)
        return net_folder
    if os.path.exists(LOCAL_CACHE_DIR) and len(os.listdir(LOCAL_CACHE_DIR)) > 0:
        print(f"[ETL] Rede indisponível. Utilizando pasta local de contingência: {LOCAL_CACHE_DIR}")
        return LOCAL_CACHE_DIR
    raise FileNotFoundError("[ETL] Nenhuma fonte de dados encontrada (rede e cache local indisponíveis).")

def parse_val(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return round(float(v), 2)
    s = str(v).replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except:
        return 0.0

def parse_date(v):
    if v is None: return ""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%d/%m/%Y")
    s = str(v).strip()
    if " 00:00:00" in s:
        s = s.replace(" 00:00:00", "")
    if "-" in s and len(s) == 10:
        parts = s.split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return s

def date_to_iso(dt_str):
    if not dt_str or "/" not in dt_str:
        return ""
    parts = dt_str.split("/")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return ""

def date_to_mes_ano(dt_str):
    if not dt_str or "/" not in dt_str:
        return ""
    parts = dt_str.split("/")
    if len(parts) == 3:
        return f"{parts[1]}/{parts[2]}"
    return ""

def date_to_ano(dt_str):
    if not dt_str or "/" not in dt_str:
        return 0
    parts = dt_str.split("/")
    if len(parts) == 3:
        try:
            return int(parts[2])
        except:
            return 0
    return 0

def estimate_monthly_rate(pv, pmt, n):
    """Estima a taxa de juros mensal (Tabela Price) via método numérico de Newton-Raphson."""
    if pv <= 0 or pmt <= 0 or n <= 0 or (pmt * n) <= pv:
        return 0.0
    r = 0.015  # chute inicial 1.5% a.m.
    for _ in range(35):
        if r <= 0: r = 0.001
        factor = (1.0 + r) ** (-n)
        f = pmt * (1.0 - factor) / r - pv
        f_prime = pmt * ((n * r * factor / (1.0 + r)) - (1.0 - factor)) / (r * r)
        if abs(f_prime) < 1e-12: break
        r_new = r - f / f_prime
        if abs(r_new - r) < 1e-6:
            r = r_new
            break
        r = max(0.0001, min(0.15, r_new))
    return round(r * 100.0, 2)

def extract_generic_contract(folder, fname):
    """
    Parser universal e resiliente para qualquer nova planilha de financiamento
    adicionada à pasta de rede da Controladoria. Identifica automaticamente
    cabeçalhos, parcelas, valores, vencimentos, status e parâmetros.
    """
    fpath = os.path.join(folder, fname)
    if not os.path.exists(fpath):
        return None
    try:
        wb = openpyxl.load_workbook(fpath, data_only=True)
    except Exception as e:
        print(f"[ETL Dinâmico] Erro ao abrir {fname}: {e}")
        return None

    # Nome limpo e ID
    clean_name = fname.replace("Financiamento ", "").replace("financiamento ", "")
    clean_name = os.path.splitext(clean_name)[0].replace("_", " ").strip()
    c_id = "fin_" + clean_name.lower().replace(" ", "_").replace("-", "_")

    # Detectar Categoria
    lower_fname = fname.lower()
    if any(k in lower_fname for k in ["corolla", "carro", "veiculo", "veículo", "caminhao", "caminhão", "daf", "mko", "van", "fiat", "strada", "hilux", "fluence", "auto"]):
        categoria = "Veículos"
        produto_default = "Veículo"
    elif any(k in lower_fname for k in ["maquina", "máquina", "perfuratriz", "trator", "escavadeira", "drill", "compressor"]):
        categoria = "Máquinas"
        produto_default = "Equipamento / Máquina"
    elif any(k in lower_fname for k in ["base", "terreno", "imovel", "imóvel", "predio", "prédio", "galpao", "galpão", "sala"]):
        categoria = "Imóveis"
        produto_default = "Imóvel"
    else:
        categoria = "Outros"
        produto_default = "Financiamento"

    # Detectar Instituição
    instituicao = "Financeira / Banco"
    for k, inst in [("sicoob", "SICOOB"), ("senff", "Banco Senff"), ("bradesco", "Bradesco"), ("itau", "Itaú"), ("santander", "Santander"), ("bb", "Banco do Brasil"), ("caixa", "Caixa Econômica"), ("bv", "Banco BV"), ("safra", "Banco Safra"), ("pan", "Banco Pan")]:
        if k in lower_fname:
            instituicao = inst
            break

    # Escolher a melhor aba para as parcelas
    target_ws = None
    priority_sheets = ["controle", "cronograma pmt", "cronograma", "acompanhamento", "pmt", "parcelas", "fluxo"]
    for s in wb.sheetnames:
        if s.lower().strip() in priority_sheets:
            target_ws = wb[s]
            break
    if not target_ws:
        for s in wb.sheetnames:
            if "dashboard" not in s.lower() and "resumo" not in s.lower():
                target_ws = wb[s]
                break
    if not target_ws:
        target_ws = wb.worksheets[0]

    # Detectar parâmetros gerais (ex: Colunas laterais ou outras abas)
    v_fin = 0.0
    taxa = 0.0
    contrato_num = ""
    produto = produto_default
    sistema = "Tabela PRICE"

    for ws_scan in wb.worksheets:
        for r in range(1, min(25, ws_scan.max_row + 1)):
            for c in range(1, min(15, ws_scan.max_column + 1)):
                cell_txt = str(ws_scan.cell(r, c).value or "").strip().lower()
                if "valor financiado" in cell_txt:
                    v_fin = parse_val(ws_scan.cell(r, c + 1).value)
                elif "taxa" in cell_txt and taxa == 0.0:
                    t_val = ws_scan.cell(r, c + 1).value
                    if isinstance(t_val, (int, float)):
                        taxa = float(t_val) * (100.0 if t_val < 1.0 else 1.0)
                elif "contrato" in cell_txt and not contrato_num:
                    c_val = str(ws_scan.cell(r, c + 1).value or "").strip()
                    if c_val and c_val != "None":
                        contrato_num = c_val

    # Detectar cabeçalho da tabela de parcelas
    header_row = -1
    col_map = {}
    for r in range(1, min(15, target_ws.max_row + 1)):
        row_txts = [str(target_ws.cell(r, c).value or "").strip().lower() for c in range(1, target_ws.max_column + 1)]
        has_parcela = any("parcela" in t or "nº" in t or t == "num" or t == "item" for t in row_txts)
        has_venc = any("vencimento" in t or "venc" in t for t in row_txts)
        if has_parcela or has_venc:
            header_row = r
            for c in range(1, target_ws.max_column + 1):
                t = str(target_ws.cell(r, c).value or "").strip().lower()
                if not t: continue
                if any(x in t for x in ["parcela", "nº", "numero", "num", "item"]):
                    if "col_num" not in col_map: col_map["col_num"] = c
                elif any(x in t for x in ["vencimento", "venc", "dt venc"]):
                    if "col_venc" not in col_map: col_map["col_venc"] = c
                elif any(x in t for x in ["previsto", "prestacao", "prestação", "pmt", "valor parcela", "valor previsto", "valor doc"]):
                    if "col_pmt" not in col_map: col_map["col_pmt"] = c
                elif any(x in t for x in ["valor pago", "vlr pago", "pago"]):
                    if "col_pago" not in col_map: col_map["col_pago"] = c
                elif any(x in t for x in ["data pgto", "dt pgto", "data pag", "data pagamento"]):
                    if "col_dt_pag" not in col_map: col_map["col_dt_pag"] = c
                elif any(x in t for x in ["status", "situacao", "situação"]):
                    if "col_status" not in col_map: col_map["col_status"] = c
                elif any(x in t for x in ["saldo projetado", "saldo devedor", "saldo final", "saldo"]):
                    if "col_saldo" not in col_map: col_map["col_saldo"] = c
                elif "juros" in t:
                    if "col_juros" not in col_map: col_map["col_juros"] = c
                elif any(x in t for x in ["amortizacao", "amortização"]):
                    if "col_amort" not in col_map: col_map["col_amort"] = c
                elif any(x in t for x in ["diferenca", "diferença"]):
                    if "col_dif" not in col_map: col_map["col_dif"] = c
            break

    if header_row == -1 or "col_venc" not in col_map:
        print(f"[ETL Dinâmico] Não foi possível identificar cabeçalho em {fname}")
        return None

    # Extrair parcelas
    parcelas = []
    col_num = col_map.get("col_num", 1)
    col_venc = col_map.get("col_venc", 2)
    col_pmt = col_map.get("col_pmt", 3)
    col_pago = col_map.get("col_pago")
    col_dt_pag = col_map.get("col_dt_pag")
    col_status = col_map.get("col_status")
    col_saldo = col_map.get("col_saldo")
    col_juros = col_map.get("col_juros")
    col_amort = col_map.get("col_amort")
    col_dif = col_map.get("col_dif")

    for r in range(header_row + 1, target_ws.max_row + 1):
        raw_num = target_ws.cell(r, col_num).value if col_num else None
        raw_venc = target_ws.cell(r, col_venc).value if col_venc else None
        if raw_num is None and raw_venc is None:
            continue
        
        p_num = len(parcelas) + 1
        if raw_num is not None and str(raw_num).strip().isdigit():
            p_num = int(raw_num)
        elif raw_venc is None:
            continue

        dt_venc = parse_date(raw_venc)
        if not dt_venc or "/" not in dt_venc:
            continue

        v_pmt = parse_val(target_ws.cell(r, col_pmt).value) if col_pmt else 0.0
        v_pago = parse_val(target_ws.cell(r, col_pago).value) if col_pago else 0.0
        dt_pag = parse_date(target_ws.cell(r, col_dt_pag).value) if col_dt_pag else ""
        st_raw = str(target_ws.cell(r, col_status).value or "").strip().lower() if col_status else ""
        saldo_proj = parse_val(target_ws.cell(r, col_saldo).value) if col_saldo else 0.0
        juros_val = parse_val(target_ws.cell(r, col_juros).value) if col_juros else 0.0
        amort_val = parse_val(target_ws.cell(r, col_amort).value) if col_amort else 0.0
        dif_val = parse_val(target_ws.cell(r, col_dif).value) if col_dif else 0.0

        is_pago = (st_raw in ["paga", "pago", "liquidado", "liquidada"] or v_pago > 0)
        status = "Pago" if is_pago else "Pendente"
        if is_pago and v_pago == 0.0:
            v_pago = v_pmt

        saldo_rest = 0.0 if is_pago else v_pmt

        parcelas.append({
            "numero": p_num,
            "tipo": "Mensal",
            "vencimento": dt_venc,
            "vencimento_iso": date_to_iso(dt_venc),
            "mes_ano": date_to_mes_ano(dt_venc),
            "ano": date_to_ano(dt_venc),
            "prestacao": v_pmt,
            "juros": juros_val,
            "amortizacao": amort_val,
            "saldo_devedor": saldo_rest,
            "status": status,
            "data_pagamento": dt_pag if is_pago else "",
            "valor_pago": v_pago if is_pago else 0.0,
            "diferenca": dif_val
        })

    if not parcelas:
        print(f"[ETL Dinâmico] Nenhuma parcela extraída em {fname}")
        return None

    tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
    tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
    qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
    qtd_pend = len(parcelas) - qtd_pagas
    prest_media = parcelas[0]["prestacao"] if parcelas else 0.0

    if v_fin == 0.0:
        v_fin = round(sum(p["prestacao"] for p in parcelas), 2)

    if taxa == 0.0 and v_fin > 0 and len(parcelas) > 0 and prest_media > 0:
        taxa = estimate_monthly_rate(v_fin, prest_media, len(parcelas))

    return {
        "id": c_id,
        "nome": clean_name,
        "arquivo": fname,
        "instituicao": instituicao,
        "categoria": categoria,
        "contrato": contrato_num or clean_name,
        "produto": produto,
        "sistema": sistema,
        "data_operacao": parcelas[0]["vencimento"] if parcelas else "",
        "vencimento_final": parcelas[-1]["vencimento"] if parcelas else "",
        "valor_financiado": v_fin,
        "valor_liquido": v_fin,
        "taxa_mensal": round(taxa, 2),
        "prestacao_mensal": prest_media,
        "total_parcelas": len(parcelas),
        "qtd_pagas": qtd_pagas,
        "qtd_pendentes": qtd_pend,
        "total_pago": tot_pago,
        "saldo_devedor": tot_aberto,
        "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
        "parcelas": parcelas
    }

def extract_all_contracts(folder):
    contratos = []
    processed_files = set()
    
    # ----------------------------------------------------
    # 1. Financiamento 1ª Maquina Senff.xlsx (2 Contratos)
    # ----------------------------------------------------
    processed_files.add("Financiamento 1ª Maquina Senff.xlsx")
    f_senff = os.path.join(folder, "Financiamento 1ª Maquina Senff.xlsx")
    if os.path.exists(f_senff):
        try:
            wb = openpyxl.load_workbook(f_senff, data_only=True)
            senff_configs = [
                {
                    "sheet": "Contrato 2953975",
                    "id": "senff_2953975",
                    "nome": "1ª Perfuratriz Senff (PEAC)",
                    "produto": "2624-7 BNDES PEAC POS"
                },
                {
                    "sheet": "Contrato 2948041",
                    "id": "senff_2948041",
                    "nome": "1ª Perfuratriz Senff (ECG)",
                    "produto": "2623-9 BNDES ECG POS"
                }
            ]
            for cfg in senff_configs:
                if cfg["sheet"] in wb.sheetnames:
                    ws = wb[cfg["sheet"]]
                    contrato_num = str(ws.cell(4, 2).value or "").strip()
                    v_fin = parse_val(ws.cell(10, 2).value)
                    v_liq = parse_val(ws.cell(11, 2).value)
                    taxa = parse_val(ws.cell(17, 2).value) * 100.0  # % a.m.
                    
                    parcelas = []
                    for r in range(24, ws.max_row + 1):
                        p_num = ws.cell(r, 1).value
                        if p_num is None or not str(p_num).isdigit():
                            continue
                        dt_venc = parse_date(ws.cell(r, 2).value)
                        dt_pag = parse_date(ws.cell(r, 3).value)
                        v_prest = parse_val(ws.cell(r, 4).value)
                        v_total_pmt = parse_val(ws.cell(r, 11).value) or v_prest
                        status_raw = str(ws.cell(r, 12).value or "").strip().lower()
                        v_pago = parse_val(ws.cell(r, 13).value)
                        
                        is_pago = (status_raw == "pago" or v_pago > 0)
                        status = "Pago" if is_pago else "Pendente"
                        if is_pago and v_pago == 0.0:
                            v_pago = v_total_pmt
                        
                        saldo_rest = 0.0 if is_pago else v_total_pmt
                        
                        parcelas.append({
                            "numero": int(p_num),
                            "tipo": "Mensal",
                            "vencimento": dt_venc,
                            "vencimento_iso": date_to_iso(dt_venc),
                            "mes_ano": date_to_mes_ano(dt_venc),
                            "ano": date_to_ano(dt_venc),
                            "prestacao": v_total_pmt,
                            "juros": 0.0,
                            "amortizacao": 0.0,
                            "saldo_devedor": saldo_rest,
                            "status": status,
                            "data_pagamento": dt_pag if is_pago else "",
                            "valor_pago": v_pago if is_pago else 0.0,
                            "diferenca": parse_val(ws.cell(r, 14).value)
                        })
                    
                    # Totais do contrato
                    tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
                    tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
                    qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
                    qtd_pend = len(parcelas) - qtd_pagas
                    
                    contratos.append({
                        "id": cfg["id"],
                        "nome": cfg["nome"],
                        "arquivo": "Financiamento 1ª Maquina Senff.xlsx",
                        "instituicao": "Banco Senff",
                        "categoria": "Máquinas",
                        "contrato": contrato_num or cfg["sheet"].replace("Contrato ", ""),
                        "produto": cfg["produto"],
                        "sistema": "BNDES Pós-fixado",
                        "data_operacao": parse_date(ws.cell(8, 2).value) if ws.cell(8, 2).value else "",
                        "vencimento_final": parse_date(ws.cell(9, 2).value),
                        "valor_financiado": v_fin,
                        "valor_liquido": v_liq,
                        "taxa_mensal": round(taxa, 2),
                        "prestacao_mensal": parcelas[0]["prestacao"] if parcelas else 0.0,
                        "total_parcelas": len(parcelas),
                        "qtd_pagas": qtd_pagas,
                        "qtd_pendentes": qtd_pend,
                        "total_pago": tot_pago,
                        "saldo_devedor": tot_aberto,
                        "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
                        "parcelas": parcelas
                    })
        except Exception as e:
            print(f"[ETL] Erro ao ler Financiamento 1ª Maquina Senff.xlsx: {e}")

    # ----------------------------------------------------
    # 2. Financiamento 2ª Máquina.xlsx
    # ----------------------------------------------------
    processed_files.add("Financiamento 2ª Máquina.xlsx")
    f_maq2 = os.path.join(folder, "Financiamento 2ª Máquina.xlsx")
    if os.path.exists(f_maq2):
        try:
            wb = openpyxl.load_workbook(f_maq2, data_only=True)
            ws_res = wb["Resumo"] if "Resumo" in wb.sheetnames else wb.worksheets[0]
            contrato_num = str(ws_res.cell(5, 2).value or "").strip()
            v_fin = parse_val(ws_res.cell(10, 2).value)
            v_liq = parse_val(ws_res.cell(11, 2).value)
            taxa = parse_val(ws_res.cell(14, 2).value) * 100.0
            dt_op = parse_date(ws_res.cell(8, 2).value)
            dt_fim = parse_date(ws_res.cell(9, 2).value)
            
            # Aba de cronograma exato para juros/amortização
            juros_map = {}
            if "Cronograma Exato" in wb.sheetnames:
                ws_ex = wb["Cronograma Exato"]
                for r in range(2, ws_ex.max_row + 1):
                    p_num = ws_ex.cell(r, 1).value
                    if p_num is not None and str(p_num).isdigit():
                        juros_map[int(p_num)] = parse_val(ws_ex.cell(r, 5).value)
            
            ws_acomp = wb["Acompanhamento"] if "Acompanhamento" in wb.sheetnames else wb.worksheets[1]
            parcelas = []
            for r in range(2, ws_acomp.max_row + 1):
                p_num = ws_acomp.cell(r, 1).value
                if p_num is None or not str(p_num).isdigit():
                    continue
                p_num_int = int(p_num)
                dt_venc = parse_date(ws_acomp.cell(r, 2).value)
                v_doc = parse_val(ws_acomp.cell(r, 3).value)
                st_raw = str(ws_acomp.cell(r, 4).value or "").strip().lower()
                dt_pag_val = ws_acomp.cell(r, 5).value
                dt_pag = parse_date(dt_pag_val) if dt_pag_val != 0 else ""
                v_pago = parse_val(ws_acomp.cell(r, 6).value)
                
                is_pago = (st_raw in ["paga", "pago"] or v_pago > 0)
                status = "Pago" if is_pago else "Pendente"
                if is_pago and v_pago == 0.0:
                    v_pago = v_doc
                
                saldo_rest = 0.0 if is_pago else v_doc
                juros_val = juros_map.get(p_num_int, 0.0)
                amort_val = max(0.0, v_doc - juros_val) if juros_val > 0 else 0.0
                
                parcelas.append({
                    "numero": p_num_int,
                    "tipo": "Mensal",
                    "vencimento": dt_venc,
                    "vencimento_iso": date_to_iso(dt_venc),
                    "mes_ano": date_to_mes_ano(dt_venc),
                    "ano": date_to_ano(dt_venc),
                    "prestacao": v_doc,
                    "juros": juros_val,
                    "amortizacao": round(amort_val, 2),
                    "saldo_devedor": saldo_rest,
                    "status": status,
                    "data_pagamento": dt_pag if is_pago else "",
                    "valor_pago": v_pago if is_pago else 0.0,
                    "diferenca": parse_val(ws_acomp.cell(r, 7).value)
                })
            
            tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
            tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
            qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
            qtd_pend = len(parcelas) - qtd_pagas
            
            contratos.append({
                "id": "sicoob_maq2",
                "nome": "2ª Perfuratriz Sicoob",
                "arquivo": "Financiamento 2ª Máquina.xlsx",
                "instituicao": "SICOOB",
                "categoria": "Máquinas",
                "contrato": contrato_num or "9769857",
                "produto": "Capital de Giro - Perfuratriz",
                "sistema": "SAC Decrescente",
                "data_operacao": dt_op,
                "vencimento_final": dt_fim,
                "valor_financiado": v_fin,
                "valor_liquido": v_liq,
                "taxa_mensal": round(taxa, 2),
                "prestacao_mensal": parcelas[0]["prestacao"] if parcelas else 0.0,
                "total_parcelas": len(parcelas),
                "qtd_pagas": qtd_pagas,
                "qtd_pendentes": qtd_pend,
                "total_pago": tot_pago,
                "saldo_devedor": tot_aberto,
                "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
                "parcelas": parcelas
            })
        except Exception as e:
            print(f"[ETL] Erro ao ler Financiamento 2ª Máquina.xlsx: {e}")

    # ----------------------------------------------------
    # 3, 4, 7, 8: Padrão Sicoob Price (3ª Maquina, Wilian, Daf Azul, MKO)
    # ----------------------------------------------------
    std_sicoob = [
        ("Financiamento 3ª Máquina.xlsx", "sicoob_maq3", "3ª Perfuratriz Sicoob", "Máquinas", "Perfuratriz"),
        ("Financiamento Carro Wilian.xlsx", "sicoob_wilian", "Carro Wilian (Osório)", "Veículos", "Veículo Leve"),
        ("Financiamento Daf Azul JBK.xlsx", "sicoob_daf", "Caminhão DAF Azul JBK", "Veículos", "Caminhão Pesado"),
        ("Financiamento Vermelho MKO.xlsx", "sicoob_mko", "Caminhão Vermelho MKO", "Veículos", "Caminhão Pesado")
    ]
    for fname, c_id, nome, cat, prod in std_sicoob:
        processed_files.add(fname)
        fpath = os.path.join(folder, fname)
        if os.path.exists(fpath):
            try:
                wb = openpyxl.load_workbook(fpath, data_only=True)
                ws_par = wb["Parâmetros"] if "Parâmetros" in wb.sheetnames else wb.worksheets[0]
                contrato_num = str(ws_par.cell(6, 2).value or "").strip()
                v_fin = parse_val(ws_par.cell(9, 2).value)
                v_liq = parse_val(ws_par.cell(10, 2).value)
                taxa = parse_val(ws_par.cell(11, 2).value) * 100.0
                dt_op = parse_date(ws_par.cell(7, 2).value)
                dt_fim = parse_date(ws_par.cell(8, 2).value)
                
                ws_cron = wb["Cronograma PMT"] if "Cronograma PMT" in wb.sheetnames else wb.worksheets[1]
                parcelas = []
                for r in range(2, ws_cron.max_row + 1):
                    p_num = ws_cron.cell(r, 1).value
                    if p_num is None or not str(p_num).isdigit():
                        continue
                    dt_venc = parse_date(ws_cron.cell(r, 2).value)
                    saldo_ini = parse_val(ws_cron.cell(r, 3).value)
                    juros_val = parse_val(ws_cron.cell(r, 4).value)
                    amort_val = parse_val(ws_cron.cell(r, 5).value)
                    v_pmt = parse_val(ws_cron.cell(r, 6).value)
                    saldo_fim = parse_val(ws_cron.cell(r, 7).value)
                    status_raw = str(ws_cron.cell(r, 8).value or "").strip().lower()
                    dt_pag = parse_date(ws_cron.cell(r, 9).value)
                    v_pago = parse_val(ws_cron.cell(r, 10).value)
                    dif = parse_val(ws_cron.cell(r, 11).value)
                    dias_atr = int(ws_cron.cell(r, 12).value or 0) if isinstance(ws_cron.cell(r, 12).value, (int, float)) else 0
                    
                    is_pago = (status_raw in ["paga", "pago"] or v_pago > 0)
                    status = "Pago" if is_pago else "Pendente"
                    if is_pago and v_pago == 0.0:
                        v_pago = v_pmt
                    
                    saldo_rest = 0.0 if is_pago else v_pmt
                    
                    parcelas.append({
                        "numero": int(p_num),
                        "tipo": "Mensal",
                        "vencimento": dt_venc,
                        "vencimento_iso": date_to_iso(dt_venc),
                        "mes_ano": date_to_mes_ano(dt_venc),
                        "ano": date_to_ano(dt_venc),
                        "saldo_inicial": saldo_ini,
                        "juros": juros_val,
                        "amortizacao": amort_val,
                        "prestacao": v_pmt,
                        "saldo_devedor": saldo_rest,
                        "saldo_final_contrato": saldo_fim,
                        "status": status,
                        "data_pagamento": dt_pag if is_pago else "",
                        "valor_pago": v_pago if is_pago else 0.0,
                        "diferenca": dif,
                        "dias_atraso": dias_atr
                    })
                
                tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
                tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
                qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
                qtd_pend = len(parcelas) - qtd_pagas
                
                contratos.append({
                    "id": c_id,
                    "nome": nome,
                    "arquivo": fname,
                    "instituicao": "SICOOB",
                    "categoria": cat,
                    "contrato": contrato_num,
                    "produto": prod,
                    "sistema": "Tabela PRICE",
                    "data_operacao": dt_op,
                    "vencimento_final": dt_fim,
                    "valor_financiado": v_fin,
                    "valor_liquido": v_liq,
                    "taxa_mensal": round(taxa, 2),
                    "prestacao_mensal": parcelas[0]["prestacao"] if parcelas else 0.0,
                    "total_parcelas": len(parcelas),
                    "qtd_pagas": qtd_pagas,
                    "qtd_pendentes": qtd_pend,
                    "total_pago": tot_pago,
                    "saldo_devedor": tot_aberto,
                    "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
                    "parcelas": parcelas
                })
            except Exception as e:
                print(f"[ETL] Erro ao ler {fname}: {e}")

    # ----------------------------------------------------
    # 5. Financiamento Compra Base NH.xlsx
    # ----------------------------------------------------
    processed_files.add("Financiamento Compra Base NH.xlsx")
    f_nh = os.path.join(folder, "Financiamento Compra Base NH.xlsx")
    if os.path.exists(f_nh):
        try:
            wb = openpyxl.load_workbook(f_nh, data_only=True)
            ws = wb["PMT Contrato"]
            v_total = parse_val(ws.cell(3, 2).value)
            v_entrada = parse_val(ws.cell(4, 2).value)
            dt_ass = parse_date(ws.cell(10, 2).value)
            
            parcelas = []
            for r in range(16, ws.max_row + 1):
                p_num = ws.cell(r, 1).value
                if p_num is None or not str(p_num).isdigit():
                    continue
                tipo = str(ws.cell(r, 2).value or "Mensal").strip()
                dt_venc = parse_date(ws.cell(r, 3).value)
                v_base = parse_val(ws.cell(r, 4).value)
                v_corr = parse_val(ws.cell(r, 6).value) or v_base
                v_pago = parse_val(ws.cell(r, 7).value)
                status_raw = str(ws.cell(r, 9).value or "").strip().lower()
                
                is_pago = (status_raw in ["paga", "pago"] or v_pago > 0)
                status = "Pago" if is_pago else "Pendente"
                if is_pago and v_pago == 0.0:
                    v_pago = v_corr
                
                saldo_rest = 0.0 if is_pago else v_corr
                
                parcelas.append({
                    "numero": int(p_num),
                    "tipo": tipo,
                    "vencimento": dt_venc,
                    "vencimento_iso": date_to_iso(dt_venc),
                    "mes_ano": date_to_mes_ano(dt_venc),
                    "ano": date_to_ano(dt_venc),
                    "prestacao": v_corr,
                    "juros": 0.0,
                    "amortizacao": v_corr,
                    "saldo_devedor": saldo_rest,
                    "status": status,
                    "data_pagamento": "",
                    "valor_pago": v_pago if is_pago else 0.0,
                    "diferenca": 0.0
                })
            
            tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
            tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
            qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
            qtd_pend = len(parcelas) - qtd_pagas
            
            contratos.append({
                "id": "compra_base_nh",
                "nome": "Compra Base Novo Hamburgo",
                "arquivo": "Financiamento Compra Base NH.xlsx",
                "instituicao": "Pro-Formula",
                "categoria": "Imóveis",
                "contrato": "Contrato Base NH",
                "produto": "Imóvel Comercial / Operacional",
                "sistema": "Parcelamento Direto c/ IPCA",
                "data_operacao": dt_ass,
                "vencimento_final": parcelas[-1]["vencimento"] if parcelas else "",
                "valor_total_imovel": v_total,
                "valor_entrada": v_entrada,
                "valor_financiado": round(v_total - v_entrada, 2),
                "valor_liquido": round(v_total - v_entrada, 2),
                "taxa_mensal": 0.0,
                "prestacao_mensal": 47750.00,
                "reforcos_anuais": 4,
                "valor_reforco": 160000.00,
                "total_parcelas": len(parcelas),
                "qtd_pagas": qtd_pagas,
                "qtd_pendentes": qtd_pend,
                "total_pago": tot_pago,
                "saldo_devedor": tot_aberto,
                "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
                "parcelas": parcelas
            })
        except Exception as e:
            print(f"[ETL] Erro ao ler Financiamento Compra Base NH.xlsx: {e}")

    # ----------------------------------------------------
    # 6. Financiamento Compra Terreno.xlsx
    # ----------------------------------------------------
    processed_files.add("Financiamento Compra Terreno.xlsx")
    f_ter = os.path.join(folder, "Financiamento Compra Terreno.xlsx")
    if os.path.exists(f_ter):
        try:
            wb = openpyxl.load_workbook(f_ter, data_only=True)
            ws = wb["PMT Contrato"]
            v_total = parse_val(ws.cell(3, 2).value)
            v_entrada = parse_val(ws.cell(4, 2).value)
            dt_ass = parse_date(ws.cell(8, 2).value)
            
            parcelas = []
            for r in range(14, ws.max_row + 1):
                p_num = ws.cell(r, 1).value
                if p_num is None or not str(p_num).isdigit():
                    continue
                dt_venc = parse_date(ws.cell(r, 2).value)
                v_parc = parse_val(ws.cell(r, 3).value)
                v_pago = parse_val(ws.cell(r, 4).value)
                status_raw = str(ws.cell(r, 6).value or "").strip().lower()
                
                is_pago = (status_raw in ["paga", "pago"] or v_pago > 0)
                status = "Pago" if is_pago else "Pendente"
                if is_pago and v_pago == 0.0:
                    v_pago = v_parc
                
                saldo_rest = 0.0 if is_pago else v_parc
                
                parcelas.append({
                    "numero": int(p_num),
                    "tipo": "Mensal",
                    "vencimento": dt_venc,
                    "vencimento_iso": date_to_iso(dt_venc),
                    "mes_ano": date_to_mes_ano(dt_venc),
                    "ano": date_to_ano(dt_venc),
                    "prestacao": v_parc,
                    "juros": 0.0,
                    "amortizacao": v_parc,
                    "saldo_devedor": saldo_rest,
                    "status": status,
                    "data_pagamento": dt_venc if is_pago else "",
                    "valor_pago": v_pago if is_pago else 0.0,
                    "diferenca": round(v_parc - v_pago, 2) if is_pago else 0.0
                })
            
            tot_pago = round(sum(p["valor_pago"] for p in parcelas), 2)
            tot_aberto = round(sum(p["prestacao"] for p in parcelas if p["status"] == "Pendente"), 2)
            qtd_pagas = sum(1 for p in parcelas if p["status"] == "Pago")
            qtd_pend = len(parcelas) - qtd_pagas
            
            contratos.append({
                "id": "compra_terreno_sl",
                "nome": "Compra Terreno São Leopoldo",
                "arquivo": "Financiamento Compra Terreno.xlsx",
                "instituicao": "F. E. Hugentobler",
                "categoria": "Imóveis",
                "contrato": "Terreno Feitoria",
                "produto": "Terreno Comercial / Operacional",
                "sistema": "Parcelamento Direto 18x",
                "data_operacao": "09/10/2025",
                "vencimento_final": parcelas[-1]["vencimento"] if parcelas else "",
                "valor_total_imovel": v_total,
                "valor_entrada": v_entrada,
                "valor_financiado": round(v_total - v_entrada, 2),
                "valor_liquido": round(v_total - v_entrada, 2),
                "taxa_mensal": 0.0,
                "prestacao_mensal": 20555.56,
                "total_parcelas": len(parcelas),
                "qtd_pagas": qtd_pagas,
                "qtd_pendentes": qtd_pend,
                "total_pago": tot_pago,
                "saldo_devedor": tot_aberto,
                "pct_quitado": round((qtd_pagas / len(parcelas) * 100.0) if parcelas else 0.0, 1),
                "parcelas": parcelas
            })
        except Exception as e:
            print(f"[ETL] Erro ao ler Financiamento Compra Terreno.xlsx: {e}")

    # ----------------------------------------------------
    # Descoberta e Extração Dinâmica de Qualquer Nova Planilha na Pasta
    # ----------------------------------------------------
    try:
        if os.path.exists(folder):
            all_entries = sorted(os.listdir(folder))
            for fname in all_entries:
                if fname.startswith("~$") or not fname.lower().endswith(".xlsx"):
                    continue
                if fname in processed_files:
                    continue
                print(f"[ETL Dinâmico] Nova planilha detectada: {fname}. Processando contrato...")
                dynamic_contract = extract_generic_contract(folder, fname)
                if dynamic_contract:
                    contratos.append(dynamic_contract)
                    processed_files.add(fname)
                    print(f"[ETL Dinâmico] Sucesso! Contrato integrado: {dynamic_contract['nome']} ({dynamic_contract['total_parcelas']} parcelas, Saldo: R$ {dynamic_contract['saldo_devedor']:,.2f})")
                else:
                    print(f"[ETL Dinâmico] Aviso: A planilha {fname} não pôde ser interpretada como cronograma de parcelas.")
    except Exception as e:
        print(f"[ETL Dinâmico] Erro ao varrer novas planilhas na pasta: {e}")

    return contratos

def consolidate_data(contratos, source_folder):
    total_financiado = round(sum(c["valor_financiado"] for c in contratos), 2)
    total_pago = round(sum(c["total_pago"] for c in contratos), 2)
    saldo_devedor = round(sum(c["saldo_devedor"] for c in contratos), 2)
    total_parcelas = sum(c["total_parcelas"] for c in contratos)
    total_pagas = sum(c["qtd_pagas"] for c in contratos)
    total_pendentes = sum(c["qtd_pendentes"] for c in contratos)
    pct_quitado = round((total_pagas / total_parcelas * 100.0) if total_parcelas else 0.0, 1)
    
    # Próximas parcelas pendentes ordenadas por vencimento
    all_pending = []
    for c in contratos:
        for p in c["parcelas"]:
            if p["status"] == "Pendente" and p["vencimento_iso"]:
                all_pending.append({
                    "contrato_id": c["id"],
                    "contrato_nome": c["nome"],
                    "categoria": c["categoria"],
                    "instituicao": c["instituicao"],
                    "numero": p["numero"],
                    "tipo": p.get("tipo", "Mensal"),
                    "vencimento": p["vencimento"],
                    "vencimento_iso": p["vencimento_iso"],
                    "prestacao": p["prestacao"]
                })
    all_pending.sort(key=lambda x: x["vencimento_iso"])
    proxima_parcela = all_pending[0] if all_pending else None
    
    # Compromisso mensal médio / atual (soma das parcelas em aberto dos próximos 12 meses / 12)
    compromisso_mensal = 0.0
    for c in contratos:
        compromisso_mensal += c.get("prestacao_mensal", 0.0)
    compromisso_mensal = round(compromisso_mensal, 2)
    
    # Agrupamento por Categoria
    por_categoria = {}
    all_categories = list(dict.fromkeys(["Máquinas", "Veículos", "Imóveis"] + [c.get("categoria", "Outros") for c in contratos]))
    for cat in all_categories:
        c_list = [c for c in contratos if c["categoria"] == cat]
        fin = round(sum(c["valor_financiado"] for c in c_list), 2)
        pag = round(sum(c["total_pago"] for c in c_list), 2)
        dev = round(sum(c["saldo_devedor"] for c in c_list), 2)
        parc = sum(c["total_parcelas"] for c in c_list)
        pagas = sum(c["qtd_pagas"] for c in c_list)
        por_categoria[cat] = {
            "financiado": fin,
            "pago": pag,
            "saldo_devedor": dev,
            "contratos": len(c_list),
            "total_parcelas": parc,
            "qtd_pagas": pagas,
            "pct_quitado": round((pagas / parc * 100.0) if parc else 0.0, 1)
        }
    
    # Agrupamento por Instituição
    por_instituicao = {}
    for c in contratos:
        inst = c["instituicao"]
        if inst not in por_instituicao:
            por_instituicao[inst] = {"financiado": 0.0, "pago": 0.0, "saldo_devedor": 0.0, "contratos": 0}
        por_instituicao[inst]["financiado"] = round(por_instituicao[inst]["financiado"] + c["valor_financiado"], 2)
        por_instituicao[inst]["pago"] = round(por_instituicao[inst]["pago"] + c["total_pago"], 2)
        por_instituicao[inst]["saldo_devedor"] = round(por_instituicao[inst]["saldo_devedor"] + c["saldo_devedor"], 2)
        por_instituicao[inst]["contratos"] += 1
        
    # Desembolso Anual (2025 a 2031)
    anos_map = {}
    for c in contratos:
        for p in c["parcelas"]:
            ano = p["ano"]
            if ano > 0:
                if ano not in anos_map:
                    anos_map[ano] = {"ano": ano, "total_previsto": 0.0, "total_pago": 0.0, "total_pendente": 0.0}
                anos_map[ano]["total_previsto"] = round(anos_map[ano]["total_previsto"] + p["prestacao"], 2)
                if p["status"] == "Pago":
                    anos_map[ano]["total_pago"] = round(anos_map[ano]["total_pago"] + p["valor_pago"], 2)
                else:
                    anos_map[ano]["total_pendente"] = round(anos_map[ano]["total_pendente"] + p["prestacao"], 2)
    desembolso_anual = [anos_map[a] for a in sorted(anos_map.keys())]
    
    # Fluxo Mensal Consolidado (Mês a Mês)
    meses_map = {}
    for c in contratos:
        for p in c["parcelas"]:
            dt_iso = p["vencimento_iso"]
            if dt_iso and len(dt_iso) >= 7:
                m_key = dt_iso[:7]  # YYYY-MM
                if m_key not in meses_map:
                    parts = m_key.split("-")
                    meses_map[m_key] = {
                        "competencia_iso": m_key,
                        "competencia": f"{parts[1]}/{parts[0]}",
                        "ano": int(parts[0]),
                        "mes": int(parts[1]),
                        "total_previsto": 0.0,
                        "total_pago": 0.0,
                        "total_pendente": 0.0,
                        "maquinas": 0.0,
                        "veiculos": 0.0,
                        "imoveis": 0.0
                    }
                val = p["prestacao"]
                cat = c["categoria"]
                meses_map[m_key]["total_previsto"] = round(meses_map[m_key]["total_previsto"] + val, 2)
                if cat == "Máquinas":
                    meses_map[m_key]["maquinas"] = round(meses_map[m_key]["maquinas"] + val, 2)
                elif cat == "Veículos":
                    meses_map[m_key]["veiculos"] = round(meses_map[m_key]["veiculos"] + val, 2)
                elif cat == "Imóveis":
                    meses_map[m_key]["imoveis"] = round(meses_map[m_key]["imoveis"] + val, 2)
                
                if p["status"] == "Pago":
                    meses_map[m_key]["total_pago"] = round(meses_map[m_key]["total_pago"] + p["valor_pago"], 2)
                else:
                    meses_map[m_key]["total_pendente"] = round(meses_map[m_key]["total_pendente"] + val, 2)
                    
    fluxo_mensal = [meses_map[k] for k in sorted(meses_map.keys())]
    
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    
    return {
        "metadata": {
            "generated_at": now_str,
            "source_directory": source_folder,
            "total_contratos": len(contratos)
        },
        "totais_gerais": {
            "total_financiado": total_financiado,
            "total_pago": total_pago,
            "saldo_devedor": saldo_devedor,
            "total_parcelas": total_parcelas,
            "total_pagas": total_pagas,
            "total_pendentes": total_pendentes,
            "pct_quitado": pct_quitado,
            "compromisso_mensal": compromisso_mensal,
            "proxima_parcela": proxima_parcela,
            "proximas_parcelas_top10": all_pending[:10],
            "por_categoria": por_categoria,
            "por_instituicao": por_instituicao,
            "desembolso_anual": desembolso_anual,
            "fluxo_mensal": fluxo_mensal
        },
        "contratos": contratos
    }

def load_existing_data():
    if not os.path.exists(OUTPUT_JS_FILE):
        return None
    try:
        with open(OUTPUT_JS_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        idx = content.find("window.FINANCIAMENTOS_DATA = ")
        if idx != -1:
            json_str = content[idx + len("window.FINANCIAMENTOS_DATA = "):].strip().rstrip(";")
            return json.loads(json_str)
    except Exception as e:
        print(f"[ETL] Aviso ao carregar financiamentos_data.js existente: {e}")
    return None

def main():
    print("==================================================")
    print("BI JLE Telecom - ETL Financiamentos & PMTs")
    print("==================================================")
    
    try:
        active_folder = get_active_folder()
        contratos = extract_all_contracts(active_folder)
        if not contratos:
            raise ValueError("[ETL] Nenhum contrato válido extraído das planilhas.")
            
        data_model = consolidate_data(contratos, active_folder)
        
        force = "--force" in sys.argv
        # Verificar se os dados realmente sofreram alterações em relação ao cache atual
        existing_data = load_existing_data()
        should_write = False
        write_reason = ""
        
        if not existing_data:
            should_write = True
            write_reason = "Base de dados inexistente"
        elif force:
            should_write = True
            write_reason = "Execução forçada (--force)"
        else:
            old_body = {k: v for k, v in existing_data.items() if k != "metadata"}
            new_body = {k: v for k, v in data_model.items() if k != "metadata"}
            if json.dumps(old_body, sort_keys=True) != json.dumps(new_body, sort_keys=True):
                should_write = True
                write_reason = "Alterações detectadas nas informações financeiras ou cadastrais das planilhas"
            else:
                old_meta = existing_data.get("metadata", {})
                old_gen = old_meta.get("generated_at", "")
                today_str = datetime.date.today().strftime("%d/%m/%Y")
                if not old_gen.startswith(today_str):
                    should_write = True
                    write_reason = f"Sincronização diária de conformidade ({today_str})"

        if not should_write:
            print("\n[ETL] Nenhuma alteração financeira ou cadastral detectada nas planilhas de Financiamentos.")
            print(f"[ETL] A base '{OUTPUT_JS_FILE}' já se encontra 100% atualizada na data de hoje e alinhada com o servidor.")
            print("==================================================")
            return 0

        # Gerar arquivo JS
        js_content = f"// BI JLE Telecom - Financiamentos & PMTs Data Source\n// Gerado automaticamente em {data_model['metadata']['generated_at']}\nwindow.FINANCIAMENTOS_DATA = {json.dumps(data_model, ensure_ascii=False, indent=2)};\n"
        
        with open(OUTPUT_JS_FILE, "w", encoding="utf-8") as f:
            f.write(js_content)
            
        print(f"[ETL] Sucesso! Novo arquivo gerado: {OUTPUT_JS_FILE}")
        print(f"      Total de Contratos : {len(contratos)}")
        print(f"      Total Financiado   : R$ {data_model['totais_gerais']['total_financiado']:,.2f}")
        print(f"      Total Já Pago      : R$ {data_model['totais_gerais']['total_pago']:,.2f}")
        print(f"      Saldo Devedor      : R$ {data_model['totais_gerais']['saldo_devedor']:,.2f}")
        print(f"      Parcelas           : {data_model['totais_gerais']['total_pagas']}/{data_model['totais_gerais']['total_parcelas']} pagas ({data_model['totais_gerais']['pct_quitado']}%)")
        return 0
    except Exception as e:
        print(f"[ETL] ERRO CRÍTICO no pipeline de Financiamentos: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
