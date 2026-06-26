import csv
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime

csv_path = r"C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\mdu_data.csv"
js_path = r"C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\mdu_data.js"
cache_path = r"C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\mdu_geo_cache.json"

# Cidades e coordenadas padrão (Centro) como fallback imediato
CITY_COORDINATES = {
    "PORTO ALEGRE": [-30.0346, -51.2177],
    "NOVO HAMBURGO": [-29.6842, -51.1306],
    "CANOAS": [-29.9181, -51.1781],
    "MONTENEGRO": [-29.6883, -51.4633],
    "GRAVATAI": [-29.9377, -50.9922],
    "GRAVATAÍ": [-29.9377, -50.9922],
    "GUAIBA": [-30.1139, -51.3250],
    "GUAÍBA": [-30.1139, -51.3250],
    "SAPUCAIA DO SUL": [-29.8378, -51.1444],
    "CACHOEIRINHA": [-29.9508, -51.0967],
    "ESTEIO": [-29.8522, -51.1800],
    "CHARQUEADAS": [-29.9556, -51.6253],
    "NÃO DEFINIDA": [-30.0346, -51.2177]
}

def load_cache():
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao carregar cache geográfico: {e}")
    return {}

def save_cache(cache):
    try:
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Erro ao salvar cache geográfico: {e}")

def get_uf(cidade):
    # Todos do CSV atual estão na região metropolitana de Porto Alegre (RS)
    return "RS"

def geocode_address(address_str, cache):
    """Query OSM Nominatim to geocode an address string"""
    url = "https://nominatim.openstreetmap.org/search?q=" + urllib.parse.quote(address_str) + "&format=json&limit=1"
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'JLE-Telecom-BI-MDU-Geocoder/1.0 (jlematelecom@jletelecom.com.br)'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if res_data:
                lat = float(res_data[0]['lat'])
                lon = float(res_data[0]['lon'])
                coords = [lat, lon]
                cache[address_str] = coords
                print(f"  Geocodificado com sucesso: {address_str} -> {coords}")
                return coords
            else:
                cache[address_str] = None
                print(f"  Endereço não localizado pelo Nominatim: {address_str}")
    except Exception as e:
        print(f"  Erro ao geocodificar {address_str}: {e}")
        time.sleep(1) # delay extra em caso de erro
    return None

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

    # Parâmetro de limite máximo de novas consultas geográficas
    # Se '--all' for passado, geocodifica sem limite. Caso contrário, limite default de 30 consultas novas.
    max_new_geocodes = 9999 if '--all' in sys.argv else 30
    new_geocodes_count = 0

    cache = load_cache()
    mtime = os.path.getmtime(csv_path)
    generated_at = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')

    rows_data = []

    print(f"Iniciando compilação MDU. Limite de novas geocodificações: {max_new_geocodes}")

    with open(csv_path, mode='r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            print("Erro: CSV está vazio!")
            return

        # Filtrar linhas válidas antes para podermos fazer uma barra de progresso simples
        valid_rows = []
        for row in reader:
            if row and len(row) >= 20 and row[2].strip():
                valid_rows.append(row)

        total_rows = len(valid_rows)
        print(f"Processando {total_rows} registros...")

        for idx, row in enumerate(valid_rows):
            # Garantir que a linha tenha colunas suficientes para não quebrar
            while len(row) < 53:
                row.append('')

            os_val = row[2].strip()
            endereco = row[3].strip()
            cidade = row[4].strip().upper()
            cluster = row[5].strip().upper()

            # Normalização de Cidade
            if not cidade or cidade == '-':
                cidade = "NÃO DEFINIDA"

            # ── LÓGICA DE GEOCODIFICAÇÃO ──
            # 1. Limpar endereço removendo detalhes do Bloco/Ap/etc.
            # Ex: "RUA GARIBALDI 595 BL 1" -> "RUA GARIBALDI 595"
            addr_clean = re.sub(r'\s+(BL|BLOCO|AP|APTO|CASA|LOJA|SL|SALA|KM|QD|LT).*', '', endereco, flags=re.IGNORECASE).strip()
            
            # 2. Chave do Cache (Endereço Completo)
            uf = get_uf(cidade)
            geo_key = f"{addr_clean}, {cidade}, {uf}, Brazil".upper()

            lat, lng = None, None
            
            # Tenta buscar do cache primeiro
            if geo_key in cache:
                coords = cache[geo_key]
                if coords:
                    lat, lng = coords[0], coords[1]
            # Se não tiver no cache e não estourou o limite de novas consultas, faz a geocodificação
            elif new_geocodes_count < max_new_geocodes:
                print(f"[{idx+1}/{total_rows}] Buscando coordenadas para: {geo_key}")
                coords = geocode_address(geo_key, cache)
                if coords:
                    lat, lng = coords[0], coords[1]
                new_geocodes_count += 1
                save_cache(cache) # Salva o cache imediatamente
                time.sleep(1) # Intervalo obrigatório do Nominatim
            
            # 3. Fallback: Se falhou a busca exata (ou não consultou por conta do limite),
            # tenta buscar a coordenada da RUA (sem número) caso já esteja mapeada no cache por outra OS
            if lat is None or lng is None:
                street_only = re.sub(r'\s+\d+$', '', addr_clean).strip()
                street_key = f"{street_only}, {cidade}, {uf}, Brazil".upper()
                if street_key in cache:
                    coords = cache[street_key]
                    if coords:
                        lat, lng = coords[0], coords[1]

            # 4. Fallback 2: Se ainda assim falhar, posiciona no Centro da Cidade
            if lat is None or lng is None:
                coords = CITY_COORDINATES.get(cidade, CITY_COORDINATES["NÃO DEFINIDA"])
                lat, lng = coords[0], coords[1]

            item = {
                "os": os_val,
                "endereco": endereco,
                "cidade": cidade,
                "cluster": cluster,
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
                "valor_repasse": clean_currency(row[45]),
                "lat": lat,
                "lng": lng
            }
            rows_data.append(item)

    # Escrever no arquivo JS
    metadata = {
        "generated_at": generated_at,
        "total_rows": len(rows_data),
        "geocoded_new": new_geocodes_count
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
