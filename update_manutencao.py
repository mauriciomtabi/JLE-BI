import csv
import json
import os
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

csv_url = "https://docs.google.com/spreadsheets/d/1fcei-KujFc4oA1DO9xIrATZiY-DeXfdaLFt7s_YIYQA/export?format=csv&gid=0"
excel_path = r"\\10.121.21.252\medicoes\Matriz RS\Claro\Manutenção\Controle de Medições - Manutenção Claro RS 2026 NOVA.xlsm"

base_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(base_dir, "manutencao_data.csv")
js_path = os.path.join(base_dir, "manutencao_data.js")

ns = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

def excel_serial_to_month(serial):
    try:
        val = float(serial)
        dt = datetime(1899, 12, 30) + timedelta(days=val)
        months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
        return f"{months[dt.month-1]}/{dt.year}"
    except Exception:
        return str(serial).strip()

def load_excel_financial_data():
    financial_map = {}
    if not os.path.exists(excel_path):
        print(f"Aviso: Planilha de Medições em {excel_path} não encontrada.")
        return financial_map

    print(f"Lendo dados financeiros de {excel_path}...")
    try:
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

            sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet3.xml')) # Mnt. Demanda
            rows = sheet_tree.findall('.//main:row', ns)
            
            for row in rows[4:]:
                cells = {}
                for c in row.findall('main:c', ns):
                    r_ref = c.attrib.get('r')
                    col_let = ''.join([char for char in r_ref if char.isalpha()])
                    t_type = c.attrib.get('t')
                    v_elem = c.find('main:v', ns)
                    val = v_elem.text if v_elem is not None else None
                    if t_type == 's' and val is not None:
                        try:
                            val = shared_strings[int(val)]
                        except IndexError:
                            pass
                    cells[col_let] = val

                os_num = str(cells.get('B', '') or '').strip()
                mes_base_raw = cells.get('N', '')
                valor_raw = cells.get('P', '')

                if os_num and os_num.upper() != 'NONE':
                    mes_fmt = excel_serial_to_month(mes_base_raw) if mes_base_raw else ''
                    try:
                        v_num = float(valor_raw) if valor_raw else 0.0
                    except ValueError:
                        v_num = 0.0
                    
                    financial_map[os_num] = {
                        'mes_pagamento': mes_fmt,
                        'valor_medicao': round(v_num, 2)
                    }
        print(f"Dados financeiros carregados: {len(financial_map)} OSs mapeadas.")
    except Exception as e:
        print(f"Erro ao ler planilha Excel da rede: {e}")

    return financial_map

def download_csv():
    print(f"Baixando CSV de Manutenção de {csv_url}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(csv_url, headers=headers)
    with urllib.request.urlopen(req) as response, open(csv_path, 'wb') as out_file:
        out_file.write(response.read())
    print(f"CSV salvo com sucesso em {csv_path}")

def process_csv():
    if not os.path.exists(csv_path):
        print(f"Erro: Arquivo CSV {csv_path} não encontrado.")
        sys.exit(1)

    financial_map = load_excel_financial_data()

    print("Processando dados de Manutenção...")
    rows = []
    with open(csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for r in reader:
            if not r or len(r) < 9:
                continue
            status = r[8].strip() if len(r) > 8 else ""
            
            if not status or status.upper() in ('', '-', 'STATUS'):
                continue
            
            rows.append(r)

    print(f"Total de registros válidos de Manutenção (com Status na Coluna I): {len(rows)}")

    lookups = {
        "tipos_of": [],
        "tipos_atividade": [],
        "localidades": [],
        "equipes": [],
        "statuses": [],
        "tipos_defeito": [],
        "causas_defeito": [],
        "precificados": [],
        "meses_pagamento": []
    }

    def get_lookup_idx(key, val):
        val_clean = val.strip().upper() if isinstance(val, str) else "-"
        if not val_clean:
            val_clean = "-"
        if val_clean not in lookups[key]:
            lookups[key].append(val_clean)
        return lookups[key].index(val_clean)

    compressed_rows = []
    matched_fin_count = 0
    total_fin_value = 0.0

    for r in rows:
        ral = r[0].strip() if len(r) > 0 else "-"
        tipo_of_idx = get_lookup_idx("tipos_of", r[1] if len(r) > 1 else "-")
        atividade = r[3].strip() if len(r) > 3 else "-"
        tipo_ativ_idx = get_lookup_idx("tipos_atividade", r[5] if len(r) > 5 else "-")
        localidade_idx = get_lookup_idx("localidades", r[6] if len(r) > 6 else "-")
        logradouro = r[7].strip() if len(r) > 7 else "-"
        status_idx = get_lookup_idx("statuses", r[8] if len(r) > 8 else "-")
        data_venc = r[9].strip() if len(r) > 9 else "-"
        hora_venc = r[10].strip() if len(r) > 10 else "-"
        data_acion = r[11].strip() if len(r) > 11 else "-"
        hora_acion = r[12].strip() if len(r) > 12 else "-"
        equipe_idx = get_lookup_idx("equipes", r[13] if len(r) > 13 else "-")
        tipo_def_idx = get_lookup_idx("tipos_defeito", r[14] if len(r) > 14 else "-")
        causa_def_idx = get_lookup_idx("causas_defeito", r[15] if len(r) > 15 else "-")
        tipo_rede = r[16].strip() if len(r) > 16 else "-"
        servico_exec = r[17].strip() if len(r) > 17 else "-"
        observacao = r[18].strip() if len(r) > 18 else "-"
        cx_exist = r[19].strip() if len(r) > 19 else "-"
        cx_nova = r[20].strip() if len(r) > 20 else "-"
        fusao = r[21].strip() if len(r) > 21 else "-"
        tipo_cabo = r[22].strip() if len(r) > 22 else "-"
        lanc_m = r[23].strip() if len(r) > 23 else "-"
        espin_m = r[24].strip() if len(r) > 24 else "-"
        adeq_qtd = r[25].strip() if len(r) > 25 else "-"
        cord_m = r[26].strip() if len(r) > 26 else "-"
        task_toa = r[27].strip() if len(r) > 27 else "-"
        data_envio_rel = r[28].strip() if len(r) > 28 else "-"
        hora_envio_rel = r[29].strip() if len(r) > 29 else "-"
        precificado_idx = get_lookup_idx("precificados", r[31] if len(r) > 31 else "-")
        data_envio_claro = r[32].strip() if len(r) > 32 else "-"
        claro_pago = r[33].strip() if len(r) > 33 else "-"
        data_devol_claro = r[34].strip() if len(r) > 34 else "-"

        fin_info = financial_map.get(ral, {'mes_pagamento': '-', 'valor_medicao': 0.0})
        valor_med = fin_info['valor_medicao']
        mes_pag_idx = get_lookup_idx("meses_pagamento", fin_info['mes_pagamento'])

        if valor_med > 0:
            matched_fin_count += 1
            total_fin_value += valor_med

        compressed_rows.append([
            ral, tipo_of_idx, atividade, tipo_ativ_idx, localidade_idx,
            logradouro, status_idx, data_venc, hora_venc, data_acion,
            hora_acion, equipe_idx, tipo_def_idx, causa_def_idx, tipo_rede,
            servico_exec, observacao, cx_exist, cx_nova, fusao,
            tipo_cabo, lanc_m, espin_m, adeq_qtd, cord_m,
            task_toa, data_envio_rel, hora_envio_rel, precificado_idx, data_envio_claro,
            claro_pago, data_devol_claro, valor_med, mes_pag_idx
        ])

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"Cruzamento concluído: {matched_fin_count} OFs com valor medido > 0. Valor Total: R$ {total_fin_value:,.2f}")

    db = {
        "generated_at": now_str,
        "lookups": lookups,
        "rows": compressed_rows
    }

    print(f"Gerando {js_path}...")
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("// Data generated automatically from Google Sheet OFS & Excel Medições\n")
        f.write("(function() {\n")
        f.write(f"    const db = {json.dumps(db, ensure_ascii=False, indent=2)};\n\n")
        f.write("    const l = db.lookups;\n")
        f.write("    window.MANUTENCAO_DATA = db.rows.map(r => ({\n")
        f.write("        ral: r[0] || '-',\n")
        f.write("        tipo_of: l.tipos_of[r[1]] || '-',\n")
        f.write("        atividade: r[2] || '-',\n")
        f.write("        tipo_atividade: l.tipos_atividade[r[3]] || '-',\n")
        f.write("        localidade: l.localidades[r[4]] || '-',\n")
        f.write("        logradouro: r[5] || '-',\n")
        f.write("        status: l.statuses[r[6]] || '-',\n")
        f.write("        data_vencimento: r[7] || '-',\n")
        f.write("        hora_vencimento: r[8] || '-',\n")
        f.write("        data_acionamento: r[9] || '-',\n")
        f.write("        hora_acionamento: r[10] || '-',\n")
        f.write("        equipe: l.equipes[r[11]] || '-',\n")
        f.write("        tipo_defeito: l.tipos_defeito[r[12]] || '-',\n")
        f.write("        causa_defeito: l.causas_defeito[r[13]] || '-',\n")
        f.write("        tipo_rede: r[14] || '-',\n")
        f.write("        servico_executado: r[15] || '-',\n")
        f.write("        observacao: r[16] || '-',\n")
        f.write("        cx_exist: r[17] || '-',\n")
        f.write("        cx_nova: r[18] || '-',\n")
        f.write("        fusao: r[19] || '-',\n")
        f.write("        tipo_cabo: r[20] || '-',\n")
        f.write("        lanc_m: r[21] || '-',\n")
        f.write("        espin_m: r[22] || '-',\n")
        f.write("        adeq_qtd: r[23] || '-',\n")
        f.write("        cord_m: r[24] || '-',\n")
        f.write("        task_toa: r[25] || '-',\n")
        f.write("        data_envio_relatorio: r[26] || '-',\n")
        f.write("        hora_envio_relatorio: r[27] || '-',\n")
        f.write("        precificado: l.precificados[r[28]] || '-',\n")
        f.write("        data_envio_claro: r[29] || '-',\n")
        f.write("        claro_pago: r[30] || '-',\n")
        f.write("        data_devolucao_claro: r[31] || '-',\n")
        f.write("        valor_medicao: r[32] || 0.0,\n")
        f.write("        mes_pagamento: l.meses_pagamento[r[33]] || '-'\n")
        f.write("    }));\n")
        f.write("    window.MANUTENCAO_METADATA = {\n")
        f.write("        generated_at: db.generated_at,\n")
        f.write("        count: db.rows.length\n")
        f.write("    };\n")
        f.write("    console.log('Base de Manutenção carregada:', window.MANUTENCAO_DATA.length, 'registros.');\n")
        f.write("})();\n")
        f.write("\n")
        f.write(f"// Processamento de Manutenção concluído com sucesso às {now_str}!\n")

    print(f"Processamento de Manutenção concluído com sucesso às {now_str}!")

if __name__ == "__main__":
    download_csv()
    process_csv()
