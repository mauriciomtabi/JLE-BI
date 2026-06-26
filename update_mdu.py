import csv
import json
import os
import re
from datetime import datetime

csv_path = r"C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\mdu_data.csv"
js_path = r"C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\mdu_data.js"

# Mapeamento de colunas do CSV para chaves do JS
# O CSV tem 53 colunas. Vamos identificar os indices corretos.
# 2: 'OS JLE', 3: 'Endereço', 4: 'Cidade', 5: 'Cluster', 6: 'Aging', 7: 'Quem fez Relatório', 8: 'Status',
# 9: 'Prog. %', 10: 'Cód. Imóvel', 11: 'Área', 12: 'Node', 13: 'Caixa M', 14: 'HPs', 17: 'Equipe',
# 18: 'Primeira Visita', 19: 'Segunda Visita', 29: 'Data Interna', 30: 'Data Fusão', 32: 'Data Baixa',
# 34: 'Data Relatório', 39: 'Valor Medição', 45: 'Valor Repasse'

def clean_percentage(val):
    if not val:
        return 0
    val = val.replace('%', '').strip()
    try:
        return float(val.replace(',', '.'))
    except ValueError:
        return 0

def clean_currency(val):
    if not val:
        return 0
    val = val.replace('R$', '').replace('.', '').replace(',', '.').strip()
    try:
        return float(val)
    except ValueError:
        return 0

def clean_int(val):
    if not val:
        return None
    val = re.sub(r'[^\d]', '', val)
    try:
        return int(val)
    except ValueError:
        return None

def process_mdu():
    if not os.path.exists(csv_path):
        print(f"Erro: Arquivo {csv_path} não encontrado!")
        return

    mtime = os.path.getmtime(csv_path)
    generated_at = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')

    rows_data = []

    with open(csv_path, mode='r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            print("Erro: CSV está vazio!")
            return

        for row in reader:
            if not row or len(row) < 20:
                continue
            
            # Garantir que a linha tenha colunas suficientes para não quebrar
            while len(row) < 53:
                row.append('')

            # OS JLE
            os_val = row[2].strip()
            if not os_val:
                continue # ignora linhas sem OS

            item = {
                "os": os_val,
                "endereco": row[3].strip(),
                "cidade": row[4].strip().upper(),
                "cluster": row[5].strip().upper(),
                "aging": row[6].strip(),
                "relatorio_por": row[7].strip(),
                "status": row[8].strip(),
                "prog": clean_percentage(row[9]),
                "cod_imovel": row[10].strip(),
                "area": row[11].strip(),
                "node": row[12].strip(),
                "caixa_m": row[13].strip(),
                "hps": clean_int(row[14]),
                "equipe": row[17].strip(),
                "primeira_visita": row[18].strip(),
                "segunda_visita": row[19].strip(),
                "data_interna": row[29].strip(),
                "data_fusao": row[30].strip(),
                "data_baixa": row[32].strip(),
                "data_relatorio": row[34].strip(),
                "valor_medicao": clean_currency(row[39]),
                "valor_repasse": clean_currency(row[45])
            }
            rows_data.append(item)

    # Escrever no arquivo JS
    metadata = {
        "generated_at": generated_at,
        "total_rows": len(rows_data)
    }

    with open(js_path, mode='w', encoding='utf-8') as f:
        f.write(f"// Dados MDU Compactados - Gerado em: {generated_at}\n")
        f.write(f"window.MDU_METADATA = {json.dumps(metadata, indent=4, ensure_ascii=False)};\n\n")
        f.write("window.MDU_DATA = ")
        f.write(json.dumps(rows_data, indent=4, ensure_ascii=False))
        f.write(";\n")

    print(f"Sucesso: {len(rows_data)} registros MDU processados e escritos em {js_path}")

if __name__ == "__main__":
    process_mdu()
