import csv
import json
import os
import sys
import urllib.request
from datetime import datetime

csv_url = "https://docs.google.com/spreadsheets/d/1fcei-KujFc4oA1DO9xIrATZiY-DeXfdaLFt7s_YIYQA/export?format=csv&gid=0"
base_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(base_dir, "manutencao_data.csv")
js_path = os.path.join(base_dir, "manutencao_data.js")

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

    print("Processando dados de Manutenção...")
    rows = []
    with open(csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for r in reader:
            if not r or len(r) < 9:
                continue
            status = r[8].strip() if len(r) > 8 else ""
            
            # Considerar APENAS linhas com Status válido na Coluna I (desconsidera linhas sem status / vazias)
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
        "precificados": []
    }

    def get_lookup_idx(key, val):
        val_clean = val.strip().upper() if val else "-"
        if not val_clean:
            val_clean = "-"
        if val_clean not in lookups[key]:
            lookups[key].append(val_clean)
        return lookups[key].index(val_clean)

    compressed_rows = []
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

        compressed_rows.append([
            ral, tipo_of_idx, atividade, tipo_ativ_idx, localidade_idx,
            logradouro, status_idx, data_venc, hora_venc, data_acion,
            hora_acion, equipe_idx, tipo_def_idx, causa_def_idx, tipo_rede,
            servico_exec, observacao, cx_exist, cx_nova, fusao,
            tipo_cabo, lanc_m, espin_m, adeq_qtd, cord_m,
            task_toa, data_envio_rel, hora_envio_rel, precificado_idx, data_envio_claro,
            claro_pago, data_devol_claro
        ])

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db = {
        "generated_at": now_str,
        "lookups": lookups,
        "rows": compressed_rows
    }

    print(f"Gerando {js_path}...")
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("// Data generated automatically from Google Sheet OFS\n")
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
        f.write("        data_devolucao_claro: r[31] || '-'\n")
        f.write("    }));\n")
        f.write("    window.MANUTENCAO_METADATA = {\n")
        f.write("        generated_at: db.generated_at,\n")
        f.write("        count: db.rows.length\n")
        f.write("    };\n")
        f.write("    console.log('Base de Manutenção carregada:', window.MANUTENCAO_DATA.length, 'registros.');\n")
        f.write("})();\n")

    print(f"Processamento de Manutenção concluído com sucesso às {now_str}!")

if __name__ == "__main__":
    download_csv()
    process_csv()
