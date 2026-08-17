import json
import os
import math
import time
import subprocess
import pandas as pd

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
JS_PATH = os.path.join(REPO_DIR, "veiculos_data.js")
SW_PATH = os.path.join(REPO_DIR, "sw.js")
FILE_JULY = r"C:\Users\jlema\Downloads\ABASTECIMENTO JULHO\RFCV_186943_20260805_094148.xlsx"

def clean_val(v):
    if pd.isna(v) or v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    return v

print("1. Carregando dados de JULHO da planilha...")
df_july = pd.read_excel(FILE_JULY)

july_records = []
for _, row in df_july.iterrows():
    plate_raw = str(row.get('PLACA', '')).strip()
    trans_code = str(row.get('CODIGO TRANSACAO', '')).strip()
    
    # Ignora linhas de total / resumo ou sem placa
    if pd.isna(row.get('PLACA')) or not plate_raw or plate_raw.upper() == 'TOTAL' or trans_code.upper() == 'TOTAL':
        continue
    
    dt_val = pd.to_datetime(row.get('DATA TRANSACAO'), dayfirst=True, errors='coerce')
    dt_str = dt_val.strftime('%Y-%m-%d %H:%M:%S') if pd.notna(dt_val) else str(row.get('DATA TRANSACAO', ''))
    
    rec = {
        'km': clean_val(row.get('HODOMETRO OU HORIMETRO')),
        'model': clean_val(row.get('MODELO VEICULO')),
        'vlLiter': clean_val(row.get('VL/LITRO')),
        'month': 'JULHO',
        'kml': clean_val(row.get('KM/LITRO OU LITROS/HORA')),
        'driver': clean_val(row.get('NOME MOTORISTA')),
        'plate': clean_val(row.get('PLACA')),
        'liters': clean_val(row.get('LITROS')),
        'value': clean_val(row.get('VALOR EMISSAO')),
        'fuel': clean_val(row.get('TIPO COMBUSTIVEL')),
        'uf': clean_val(row.get('UF')),
        'fleet': clean_val(row.get('TIPO FROTA')),
        'date': dt_str
    }
    july_records.append(rec)

print(f"Registros de JULHO extraídos: {len(july_records)}")

print("2. Lendo histórico existente em veiculos_data.js do JLE-BI...")
with open(JS_PATH, 'r', encoding='utf-8-sig') as f:
    text = f.read()
    if 'VEICULOS_DATA = ' in text:
        json_str = text.split('VEICULOS_DATA = ')[1].rstrip(';\n ')
    else:
        json_str = text

existing_data = json.loads(json_str)
print(f"Registros no repositório antes da atualização: {len(existing_data)}")

# Filtrar qualquer dado anterior de JULHO se já existia
historical = [r for r in existing_data if str(r.get('month', '')).upper() != 'JULHO']
print(f"Registros históricos mantidos (Jan a Jun): {len(historical)}")

# Consolidar com Julho
full_data = historical + july_records
print(f"Total consolidado final (Jan a Julho): {len(full_data)}")

# Salvar veiculos_data.js
output_js = f"const VEICULOS_DATA = {json.dumps(full_data, ensure_ascii=False, indent=2)};"
with open(JS_PATH, 'w', encoding='utf-8') as f:
    f.write(output_js)

print("3. Atualizando versão de cache no Service Worker (sw.js)...")
if os.path.exists(SW_PATH):
    with open(SW_PATH, 'r', encoding='utf-8') as f:
        sw_content = f.read()
    
    timestamp = time.strftime('%Y%m%d%H%M%S')
    new_cache = f"const CACHE_NAME = 'jle-bi-v3.16.{timestamp}';"
    import re
    sw_updated = re.sub(r"const CACHE_NAME = '([^']+)';", new_cache, sw_content)
    
    with open(SW_PATH, 'w', encoding='utf-8') as f:
        f.write(sw_updated)
    print(f"sw.js atualizado para {new_cache}")

print("4. Executando Git Commit e Push para a Vercel/GitHub...")
subprocess.run(["git", "add", "veiculos_data.js", "sw.js"], cwd=REPO_DIR, check=True)
commit_res = subprocess.run(["git", "commit", "-m", "data(veiculos): atualizacao com abastecimentos de julho 2026"], cwd=REPO_DIR, capture_output=True, text=True)
print("Git Commit Output:", commit_res.stdout)

push_res = subprocess.run(["git", "push", "origin", "main"], cwd=REPO_DIR, capture_output=True, text=True)
print("Git Push Output:", push_res.stdout)
print("Git Push Error (if any):", push_res.stderr)

print("SUCESSO TOTAL! DADOS PUBLICADOS NO GITHUB / VERCEL DO BI JLE TELECOM!")
