import csv
import json
import os
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

excel_path = r"\\10.121.21.252\medicoes\Matriz RS\Claro\Manutenção\Controle de Medições - Manutenção Claro RS 2026 NOVA.xlsm"

base_dir = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(base_dir, "manutencao_data.js")

ns = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

def excel_serial_to_date(serial):
    try:
        val = float(serial)
        dt = datetime(1899, 12, 30) + timedelta(days=val)
        return dt
    except Exception:
        return None

def excel_serial_to_month(serial):
    dt = excel_serial_to_date(serial)
    if dt:
        months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
        return f"{months[dt.month-1]}/{dt.year}"
    s = str(serial).strip().upper()
    if 'JUN' in s: return 'JUNHO/2026'
    if 'MAI' in s: return 'MAIO/2026'
    if 'ABR' in s: return 'ABRIL/2026'
    if 'MAR' in s: return 'MARÇO/2026'
    if 'FEV' in s: return 'FEVEREIRO/2026'
    if 'JUL' in s: return 'JULHO/2026'
    if 'AGO' in s: return 'AGOSTO/2026'
    if 'SET' in s: return 'SETEMBRO/2026'
    if 'OUT' in s: return 'OUTUBRO/2026'
    if 'NOV' in s: return 'NOVEMBRO/2026'
    if 'DEZ' in s: return 'DEZEMBRO/2026'
    return ""

def process_excel_100():
    if not os.path.exists(excel_path):
        print(f"Erro: Planilha Master {excel_path} não encontrada.")
        sys.exit(1)

    print(f"Lendo dados 100% da Planilha Excel Master: {excel_path} (Aba Mnt. Demanda)...")

    excel_rows = []
    with zipfile.ZipFile(excel_path) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('main:si', ns):
                t = si.find('main:t', ns)
                if t is not None and t.text:
                    shared_strings.append(t.text)
                else:
                    texts = [t_node.text for t_node in si.findall('.//main:t', ns) if t_node.text]
                    shared_strings.append(''.join(texts))

        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet4.xml')) # rId4 = Mnt. Demanda
        rows = sheet_tree.findall('.//main:row', ns)
        
        for row in rows:
            r_num = int(row.attrib.get('r', 0))
            if r_num <= 3: # Ignore title and table headers
                continue

            cells = {}
            for c in row.findall('main:c', ns):
                r_ref = c.attrib.get('r')
                col_let = ''.join([char for char in r_ref if char.isalpha()])
                t_type = c.attrib.get('t')
                v_elem = c.find('main:v', ns)
                val = v_elem.text if v_elem is not None else None
                if t_type == 's' and val is not None:
                    try: val = shared_strings[int(val)]
                    except IndexError: pass
                cells[col_let] = val

            os_num = str(cells.get('B', '') or '').strip()
            tipo_of = str(cells.get('C', '') or '').strip()
            num_os_cli = str(cells.get('D', '') or '').strip()
            ativ_desc = str(cells.get('E', '') or '').strip()
            num_cabo = str(cells.get('F', '') or '').strip()
            tipo_ativ_raw = str(cells.get('G', '') or '').strip()
            localidade = str(cells.get('H', '') or '').strip()
            cluster = str(cells.get('I', '') or '').strip()
            uf = str(cells.get('J', '') or '').strip()
            tipo_rede = str(cells.get('K', '') or '').strip()
            data_acion_raw = cells.get('L', '')
            mes_base_raw = cells.get('N', '')
            demanda_integ_raw = str(cells.get('O', '') or '').strip() # Coluna O
            valor_raw = cells.get('P', '')
            wf2_raw = str(cells.get('T', '') or '').strip() # Coluna T
            obs_raw = str(cells.get('U', '') or '').strip() # Coluna U

            if os_num and os_num.upper() != 'NONE':
                mes_fmt = excel_serial_to_month(mes_base_raw) if mes_base_raw else ''
                dt_acion = excel_serial_to_date(data_acion_raw)
                dt_acion_str = dt_acion.strftime("%d/%m/%Y") if dt_acion else ""
                
                try:
                    v_num = float(valor_raw) if valor_raw else 0.0
                except ValueError:
                    v_num = 0.0

                # Regra de Legendas (Coluna T & Coluna U):
                # - Aprovado: Coluna T não vazia (e Coluna U vazia)
                # - Pedido Gerado: Coluna T não vazia E Coluna U não vazia
                # - Aguard. aprovação: Coluna T vazia
                has_col_t = bool(wf2_raw and wf2_raw.upper() != 'NONE' and wf2_raw != '-')
                has_col_u = bool(obs_raw and obs_raw.upper() != 'NONE' and obs_raw != '-')

                if has_col_t and has_col_u:
                    legend_status = 'PEDIDO_GERADO'
                elif has_col_t:
                    legend_status = 'APROVADO'
                else:
                    legend_status = 'AGUARD_APROVACAO'

                # Higienização Demanda vs Integridade (Coluna O)
                dem_clean = demanda_integ_raw.upper()
                if 'DEMANDA' in dem_clean:
                    dem_final = 'DEMANDA'
                elif 'INTEGRIDADE' in dem_clean or 'INTEGR' in dem_clean:
                    dem_final = 'INTEGRIDADE'
                else:
                    dem_final = 'OUTROS'

                # Higienização Tipo de Atividade
                t_clean = tipo_ativ_raw.upper()
                a_desc_upper = ativ_desc.upper()
                if t_clean in ('ROMPIMENTO', 'ATENUAÇÃO', 'ADEQUAÇÃO DE REDE', 'MOBILIZAÇÃO', 'RAL DE QUALIDADE', 'MELHORIA DE REDE', 'OBRAS'):
                    tipo_ativ_final = t_clean
                elif 'ROMPIMENTO' in a_desc_upper:
                    tipo_ativ_final = 'ROMPIMENTO'
                elif 'ATENUAÇÃO' in a_desc_upper or 'ATENUACAO' in a_desc_upper:
                    tipo_ativ_final = 'ATENUAÇÃO'
                elif 'ADEQUA' in a_desc_upper:
                    tipo_ativ_final = 'ADEQUAÇÃO DE REDE'
                elif 'MOBILIZ' in a_desc_upper:
                    tipo_ativ_final = 'MOBILIZAÇÃO'
                elif 'QUALIDADE' in a_desc_upper or 'RAL' in a_desc_upper:
                    tipo_ativ_final = 'RAL DE QUALIDADE'
                elif t_clean and t_clean != 'NONE':
                    tipo_ativ_final = t_clean
                else:
                    tipo_ativ_final = 'OUTROS'

                excel_rows.append({
                    'ral': os_num,
                    'tipo_of': tipo_of if tipo_of and tipo_of != 'None' else 'RAL',
                    'atividade': ativ_desc if ativ_desc and ativ_desc != 'None' else '-',
                    'tipo_atividade': tipo_ativ_final,
                    'localidade': localidade if localidade and localidade != 'None' else '-',
                    'status': legend_status,
                    'data_acionamento': dt_acion_str,
                    'equipe': cluster if cluster and cluster != 'None' else '-',
                    'tipo_defeito': tipo_ativ_final,
                    'causa_defeito': tipo_rede if tipo_rede and tipo_rede != 'None' else '-',
                    'valor_medicao': round(v_num, 2),
                    'mes_pagamento': mes_fmt if mes_fmt else 'SEM MÊS',
                    'demanda_integ': dem_final,
                    'wf2': wf2_raw if wf2_raw and wf2_raw != 'None' else '-',
                    'obs_medicao': obs_raw if obs_raw and obs_raw != 'None' else '-',
                    'legend_status': legend_status
                })

    print(f"Total de registros 100% Excel processados: {len(excel_rows)}")
    matched_count = len([r for r in excel_rows if r['valor_medicao'] > 0])
    total_val_sum = sum(r['valor_medicao'] for r in excel_rows)
    print(f"OSs com valor medido > 0: {matched_count} | Soma Total Medida: R$ {total_val_sum:,.2f}")

    lookups = {
        "tipos_of": [],
        "tipos_atividade": [],
        "localidades": [],
        "equipes": [],
        "statuses": [],
        "tipos_defeito": [],
        "causas_defeito": [],
        "meses_pagamento": [],
        "demanda_integ": []
    }

    def get_lookup_idx(key, val):
        val_clean = val.strip().upper() if isinstance(val, str) else "-"
        if not val_clean:
            val_clean = "-"
        if val_clean not in lookups[key]:
            lookups[key].append(val_clean)
        return lookups[key].index(val_clean)

    compressed_rows = []
    for r in excel_rows:
        tipo_of_idx = get_lookup_idx("tipos_of", r['tipo_of'])
        tipo_ativ_idx = get_lookup_idx("tipos_atividade", r['tipo_atividade'])
        localidade_idx = get_lookup_idx("localidades", r['localidade'])
        status_idx = get_lookup_idx("statuses", r['status'])
        equipe_idx = get_lookup_idx("equipes", r['equipe'])
        tipo_def_idx = get_lookup_idx("tipos_defeito", r['tipo_defeito'])
        causa_def_idx = get_lookup_idx("causas_defeito", r['causa_defeito'])
        mes_pag_idx = get_lookup_idx("meses_pagamento", r['mes_pagamento'])
        dem_integ_idx = get_lookup_idx("demanda_integ", r['demanda_integ'])

        compressed_rows.append([
            r['ral'], tipo_of_idx, r['atividade'], tipo_ativ_idx, localidade_idx,
            status_idx, r['data_acionamento'], equipe_idx, tipo_def_idx, causa_def_idx,
            r['valor_medicao'], mes_pag_idx, dem_integ_idx, r['wf2'], r['obs_medicao'], r['legend_status']
        ])

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db = {
        "generated_at": now_str,
        "lookups": lookups,
        "rows": compressed_rows
    }

    print(f"Gerando {js_path}...")
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("// Data generated 100% from Master Excel Controle de Medições (Mnt. Demanda)\n")
        f.write("(function() {\n")
        f.write(f"    const db = {json.dumps(db, ensure_ascii=False, indent=2)};\n\n")
        f.write("    const l = db.lookups;\n")
        f.write("    window.MANUTENCAO_DATA = db.rows.map(r => ({\n")
        f.write("        ral: r[0] || '-',\n")
        f.write("        tipo_of: l.tipos_of[r[1]] || '-',\n")
        f.write("        atividade: r[2] || '-',\n")
        f.write("        tipo_atividade: l.tipos_atividade[r[3]] || '-',\n")
        f.write("        localidade: l.localidades[r[4]] || '-',\n")
        f.write("        status: l.statuses[r[5]] || '-',\n")
        f.write("        data_acionamento: r[6] || '-',\n")
        f.write("        equipe: l.equipes[r[7]] || '-',\n")
        f.write("        tipo_defeito: l.tipos_defeito[r[8]] || '-',\n")
        f.write("        causa_defeito: l.causas_defeito[r[9]] || '-',\n")
        f.write("        valor_medicao: r[10] || 0.0,\n")
        f.write("        mes_pagamento: l.meses_pagamento[r[11]] || '-',\n")
        f.write("        demanda_integ: l.demanda_integ[r[12]] || '-',\n")
        f.write("        wf2: r[13] || '-',\n")
        f.write("        obs_medicao: r[14] || '-',\n")
        f.write("        legend_status: r[15] || '-'\n")
        f.write("    }));\n")
        f.write("    window.MANUTENCAO_METADATA = {\n")
        f.write("        generated_at: db.generated_at,\n")
        f.write("        count: db.rows.length,\n")
        f.write(f"        total_medido: {total_val_sum:.2f}\n")
        f.write("    };\n")
        f.write("    console.log('Base 100% Excel de Manutenção carregada:', window.MANUTENCAO_DATA.length, 'registros.');\n")
        f.write("})();\n")

    print(f"Processamento 100% Excel de Manutenção concluído com sucesso às {now_str}!")

if __name__ == "__main__":
    process_excel_100()
