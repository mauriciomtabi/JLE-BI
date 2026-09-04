#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_sar_claro.py — Automação de Sincronização SAR x Analítico Claro
Verifica as linhas da Planilha Google do SAR que possuem Nº WF (Coluna AL),
cruza com o Analítico Claro e atualiza o status (Coluna V), data do pedido (Coluna AM)
e número do pedido (Coluna AN).
"""

import sys
import os
import re
import csv
import json
import datetime
import argparse
import urllib.request
import urllib.error

# Garantir UTF-8 na saída do console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "sync_sar_claro.log")
WEBHOOK_URL_FILE = os.path.join(SCRIPT_DIR, "sar_gsheet_webhook_url.txt")

GOOGLE_SHEET_ID = "1kQyIsIDmsnunTbHU46n_3FmeL8ddbGGHnXHo6FXAfq4"
GOOGLE_SHEET_GID = "1221770117"
GOOGLE_SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/export?format=csv&gid={GOOGLE_SHEET_GID}"

# Caminhos de rede candidatos para o Analítico Claro
CANDIDATE_NETWORK_DIRS = [
    r"\\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALÍTICO CLARO",
    r"\\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALITICO CLARO"
]

def log(msg):
    """Registra mensagem no console e no arquivo de log."""
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] {msg}"
    print(formatted)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def find_best_cobranca_file():
    """Localiza o arquivo mais recente do Analítico Claro na rede ou cache local, sincronizando se necessário."""
    import shutil
    best_net = None
    best_net_time = 0

    # 1. Tentar localizar na rede
    for net_dir in CANDIDATE_NETWORK_DIRS:
        if os.path.exists(net_dir):
            try:
                candidates = []
                for fname in os.listdir(net_dir):
                    if fname.startswith("~$"):
                        continue
                    if "analitico" in fname.lower() or "analítico" in fname.lower() or "cobranca" in fname.lower() or "cobrança" in fname.lower():
                        full_p = os.path.join(net_dir, fname)
                        if os.path.isfile(full_p):
                            candidates.append((os.path.getmtime(full_p), full_p))
                if candidates:
                    candidates.sort(reverse=True)
                    best_net_time = candidates[0][0]
                    best_net = candidates[0][1]
                    log(f"Arquivo do Analítico Claro encontrado na rede: {best_net}")
                    break
            except Exception as e:
                log(f"Aviso ao consultar rede ({net_dir}): {e}")

    # 2. Verificar cache local
    local_csv = os.path.join(SCRIPT_DIR, "local_cobranca_file.csv")
    local_xlsx = os.path.join(SCRIPT_DIR, "local_cobranca_file.xlsx")
    local_p = local_csv if os.path.exists(local_csv) else (local_xlsx if os.path.exists(local_xlsx) else None)
    local_time = os.path.getmtime(local_p) if (local_p and os.path.exists(local_p)) else 0

    # 3. Se houver arquivo na rede mais recente que o local, copiar localmente para leitura ultra-rápida
    if best_net:
        if best_net_time > local_time or not local_p:
            log("Copiando arquivo mais recente da rede para cache local (leitura veloz)...")
            ext = os.path.splitext(best_net)[1]
            dest = os.path.join(SCRIPT_DIR, f"local_cobranca_file{ext}")
            try:
                shutil.copy2(best_net, dest)
                log(f"Arquivo sincronizado localmente em: {dest}")
                return dest
            except Exception as e:
                log(f"Falha ao copiar da rede ({e}), usando caminho UNC diretamente...")
                return best_net
        elif local_p:
            log(f"Cache local ({local_p}) está atualizado em relação à rede.")
            return local_p

    if local_p:
        log(f"Utilizando cache local do Analítico Claro: {local_p}")
        return local_p

    return None

def load_claro_data(file_path):
    """Indexa os registros do Analítico Claro pelo número de OS/WF."""
    log(f"Carregando e indexando Analítico Claro de: {file_path}")
    claro_map = {}

    if file_path.lower().endswith(".csv") or file_path.lower().endswith(".xlsx"):
        # Se for texto delimitado por ponto e vírgula
        encodings = ['latin1', 'utf-8', 'cp1252']
        is_csv_read = False
        
        for enc in encodings:
            try:
                with open(file_path, 'r', encoding=enc, errors='replace') as f:
                    first_line = f.readline()
                    if ';' in first_line:
                        f.seek(0)
                        reader = csv.reader(f, delimiter=';')
                        headers = next(reader)
                        headers_clean = [h.strip().upper() for h in headers]
                        
                        try:
                            os_idx = headers_clean.index('OS')
                            fase_idx = headers_clean.index('FASE_ATUAL')
                            dt_aprov_idx = headers_clean.index('DATA_APROVACAO_MEDICAO')
                            num_ped_idx = headers_clean.index('NUMERO_PEDIDO')
                        except ValueError as e:
                            log(f"Cabeçalho essencial não encontrado no CSV ({enc}): {e}")
                            break
                        
                        for row in reader:
                            if len(row) <= num_ped_idx:
                                continue
                            os_raw = row[os_idx].strip()
                            os_digits = re.sub(r'\D', '', os_raw)
                            if not os_digits:
                                continue
                            
                            fase = row[fase_idx].strip().upper()
                            dt_aprov = row[dt_aprov_idx].strip()
                            num_ped = row[num_ped_idx].strip()
                            
                            if os_digits not in claro_map:
                                claro_map[os_digits] = {
                                    'fase': fase,
                                    'dt_aprovacao': dt_aprov,
                                    'num_pedido': num_ped
                                }
                            else:
                                # Prioriza linha que possua pedido preenchido
                                if num_ped and not claro_map[os_digits]['num_pedido']:
                                    claro_map[os_digits]['num_pedido'] = num_ped
                                    claro_map[os_digits]['dt_aprovacao'] = dt_aprov or claro_map[os_digits]['dt_aprovacao']
                                if 'FINALIZ' in fase:
                                    claro_map[os_digits]['fase'] = fase
                        
                        is_csv_read = True
                        break
            except Exception:
                continue

        # Se não foi CSV legível por texto, tentar openpyxl se for xlsx binário
        if not is_csv_read and file_path.lower().endswith(".xlsx"):
            try:
                import openpyxl
                log("Lendo arquivo Excel via openpyxl...")
                wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
                ws = wb.active
                rows = ws.iter_rows(values_only=True)
                headers = [str(h or '').strip().upper() for h in next(rows)]
                os_idx = headers.index('OS')
                fase_idx = headers.index('FASE_ATUAL')
                dt_aprov_idx = headers.index('DATA_APROVACAO_MEDICAO')
                num_ped_idx = headers.index('NUMERO_PEDIDO')

                for row in rows:
                    if len(row) <= num_ped_idx: continue
                    os_digits = re.sub(r'\D', '', str(row[os_idx] or ''))
                    if not os_digits: continue
                    fase = str(row[fase_idx] or '').strip().upper()
                    dt_aprov = str(row[dt_aprov_idx] or '').strip()
                    num_ped = str(row[num_ped_idx] or '').strip()

                    if os_digits not in claro_map:
                        claro_map[os_digits] = {'fase': fase, 'dt_aprovacao': dt_aprov, 'num_pedido': num_ped}
                    else:
                        if num_ped and not claro_map[os_digits]['num_pedido']:
                            claro_map[os_digits]['num_pedido'] = num_ped
                            claro_map[os_digits]['dt_aprovacao'] = dt_aprov or claro_map[os_digits]['dt_aprovacao']
                        if 'FINALIZ' in fase:
                            claro_map[os_digits]['fase'] = fase
                wb.close()
            except Exception as e:
                log(f"Erro ao ler Excel com openpyxl: {e}")

    log(f"Total de OSs/WFs únicos indexados no Analítico Claro: {len(claro_map):,}")
    return claro_map

def fetch_current_google_sheet_sar():
    """Baixa o estado atual da aba 'SAR Operacional' do Google Sheets via CSV."""
    log(f"Baixando dados online da planilha SAR do Google Sheets...")
    req = urllib.request.Request(
        GOOGLE_SHEET_CSV_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BI_JLE_Sync/1.0"}
    )
    resp = urllib.request.urlopen(req, timeout=30)
    raw_content = resp.read().decode("utf-8", errors="replace")
    
    lines = raw_content.splitlines()
    reader = csv.reader(lines)
    
    # Linhas 1 a 3 são cabeçalhos
    for _ in range(3):
        next(reader, None)
        
    records = []
    for row_idx, r in enumerate(reader, start=4):
        if len(r) < 38:
            continue
        cod = r[0].strip()
        status = r[21].strip() if len(r) > 21 else ''
        wf_raw = r[37].strip() if len(r) > 37 else ''
        dt_ped = r[38].strip() if len(r) > 38 else ''
        num_ped = r[39].strip() if len(r) > 39 else ''
        
        records.append({
            'row': row_idx,
            'cod': cod,
            'status': status,
            'wf': wf_raw,
            'data_pedido': dt_ped,
            'num_pedido': num_ped
        })
        
    log(f"Total de registros obtidos do Google Sheets: {len(records)}")
    return records

def format_date_str(d_str):
    """Padroniza formato de data para DD/MM/YYYY."""
    if not d_str: return ""
    d_str = d_str.strip()
    # Se já estiver DD/MM/YYYY
    if re.match(r'^\d{2}/\d{2}/\d{4}', d_str):
        return d_str[:10]
    # Se estiver YYYY-MM-DD
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', d_str)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return d_str[:10]

def cross_reference(sar_records, claro_map):
    """Aplica as regras de negócio para identificar atualizações necessárias."""
    updates = []
    stats = {
        'total_wf': 0,
        'matched_claro': 0,
        'finalizado_sem_pedido': 0,
        'pedido_emitido': 0,
        'sem_alteracao': 0
    }
    
    for rec in sar_records:
        wf_raw = rec['wf']
        wf_digits = re.sub(r'\D', '', wf_raw)
        if not wf_digits:
            continue
            
        stats['total_wf'] += 1
        
        if wf_digits in claro_map:
            stats['matched_claro'] += 1
            claro_info = claro_map[wf_digits]
            fase = claro_info['fase']
            num_ped = claro_info['num_pedido']
            dt_aprov = format_date_str(claro_info['dt_aprovacao'])
            
            is_finalizado_claro = 'FINALIZ' in fase or 'CONCLU' in fase or 'APROV' in fase
            
            if is_finalizado_claro:
                # Regra 1: Se tiver número do pedido no Analítico
                if num_ped:
                    stats['pedido_emitido'] += 1
                    novo_status = 'PEDIDO EMITIDO'
                    nova_dt_ped = dt_aprov
                    novo_num_ped = num_ped
                    
                    # Checar se precisa atualizar algum campo
                    status_changed = (rec['status'] != novo_status)
                    dt_changed = (rec['data_pedido'] != nova_dt_ped and nova_dt_ped != "")
                    ped_changed = (rec['num_pedido'] != novo_num_ped)
                    
                    if status_changed or dt_changed or ped_changed:
                        updates.append({
                            'row': rec['row'],
                            'cod': rec['cod'],
                            'wf': wf_digits,
                            'status': novo_status,
                            'data_pedido': nova_dt_ped,
                            'num_pedido': novo_num_ped,
                            'old_status': rec['status'],
                            'old_data_pedido': rec['data_pedido'],
                            'old_num_pedido': rec['num_pedido'],
                            'motivo': f"Pedido emitido no Analítico ({novo_num_ped})"
                        })
                    else:
                        stats['sem_alteracao'] += 1
                        
                # Regra 2: Se estiver finalizado sem número de pedido
                else:
                    stats['finalizado_sem_pedido'] += 1
                    novo_status = 'FINALIZADO'
                    
                    if rec['status'] != novo_status:
                        updates.append({
                            'row': rec['row'],
                            'cod': rec['cod'],
                            'wf': wf_digits,
                            'status': novo_status,
                            'data_pedido': rec['data_pedido'],
                            'num_pedido': rec['num_pedido'],
                            'old_status': rec['status'],
                            'old_data_pedido': rec['data_pedido'],
                            'old_num_pedido': rec['num_pedido'],
                            'motivo': f"WF finalizado no Analítico sem pedido (Fase: {fase})"
                        })
                    else:
                        stats['sem_alteracao'] += 1
                        
    return updates, stats

def send_updates_to_google_sheet(webhook_url, updates):
    """Envia o lote de atualizações para o Google Apps Script Webhook."""
    if not webhook_url:
        log("Nenhum Webhook URL configurado. As alterações não puderam ser enviadas diretamente para a nuvem.")
        return False

    log(f"Enviando {len(updates)} atualizações em lote para o Google Sheets Webhook...")
    payload = json.dumps({"updates": updates}).encode("utf-8")

    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "BI_JLE_Sync/1.0"}
    )

    try:
        resp = urllib.request.urlopen(req, timeout=60)
        res_text = resp.read().decode("utf-8")
        res_json = json.loads(res_text)
        if res_json.get("success"):
            log(f"SUCESSO: Google Sheets atualizado com sucesso! Células alteradas: {res_json.get('updated_cells')}, Linhas: {res_json.get('unique_rows_updated')}")
            return True
        else:
            log(f"ERRO retornado pelo Apps Script: {res_json.get('error')}")
            return False
    except Exception as e:
        log(f"Falha na requisição HTTP para o Google Sheets: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Sincronizador SAR x Analítico Claro")
    parser.add_argument("--dry-run", action="store_true", help="Apenas simula o cruzamento sem gravar no Google Sheets")
    parser.add_argument("--webhook-url", type=str, default="", help="URL do Webhook do Google Apps Script")
    args = parser.parse_args()

    log("=" * 60)
    log("INICIANDO SINCRONIZAÇÃO SAR x ANALÍTICO CLARO")
    log("=" * 60)

    # 1. Carregar Webhook URL se não passada por argumento
    webhook_url = args.webhook_url
    if not webhook_url and os.path.exists(WEBHOOK_URL_FILE):
        try:
            with open(WEBHOOK_URL_FILE, "r", encoding="utf-8") as f:
                webhook_url = f.read().strip()
        except Exception:
            pass

    # 2. Localizar base do Analítico Claro
    claro_file = find_best_cobranca_file()
    if not claro_file:
        log("ERRO CRÍTICO: Não foi possível localizar a base do Analítico Claro.")
        sys.exit(1)

    # 3. Carregar e indexar Analítico Claro
    claro_map = load_claro_data(claro_file)

    # 4. Baixar planilha atual do SAR
    sar_records = fetch_current_google_sheet_sar()

    # 5. Cruzar dados
    updates, stats = cross_reference(sar_records, claro_map)

    log(f"Estatísticas do Cruzamento:")
    log(f"  - Total de linhas no SAR analisadas: {len(sar_records)}")
    log(f"  - Linhas com Nº WF (Coluna AL): {stats['total_wf']}")
    log(f"  - WFs localizados no Analítico Claro: {stats['matched_claro']}")
    log(f"    * Com Pedido Emitido: {stats['pedido_emitido']}")
    log(f"    * Finalizados sem Pedido: {stats['finalizado_sem_pedido']}")
    log(f"  - Linhas sem alteração necessária: {stats['sem_alteracao']}")
    log(f"  - LINHAS QUE REQUEREM ATUALIZAÇÃO: {len(updates)}")

    if updates:
        log("\nAmostra das primeiras 10 alterações:")
        for u in updates[:10]:
            log(f"  Linha {u['row']:4d} [{u['cod']} | WF {u['wf']}]:")
            log(f"     Status: '{u['old_status']}' -> '{u['status']}'")
            log(f"     Dt Pedido (AM): '{u['old_data_pedido']}' -> '{u['data_pedido']}'")
            log(f"     Nº Pedido (AN): '{u['old_num_pedido']}' -> '{u['num_pedido']}'")

    # 6. Gravação ou Dry-Run
    if args.dry_run:
        log("\n[DRY-RUN] Nenhuma gravação foi realizada (--dry-run ativado).")
    elif updates:
        if webhook_url:
            success = send_updates_to_google_sheet(webhook_url, updates)
            if not success:
                log("ATENÇÃO: Falha ao gravar no Google Sheets via Webhook.")
        else:
            log(f"\nAVISO: URL do Webhook do Google Sheets não informada.")
            log(f"Para ativar a gravação automática na nuvem:")
            log(f"1. Instale o script 'google_apps_script_sar.js' na sua Planilha Google.")
            log(f"2. Salve a URL do Webhook em: {WEBHOOK_URL_FILE}")
    else:
        log("\nNenhuma alteração pendente. A planilha já está 100% atualizada com o Analítico Claro!")

    log("=" * 60)
    log("SINCRONIZAÇÃO CONCLUÍDA")
    log("=" * 60)

if __name__ == "__main__":
    main()
