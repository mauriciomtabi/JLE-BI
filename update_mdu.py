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

def clean_and_normalize(addr):
    # Convert to uppercase
    addr = addr.upper().strip()
    
    # Split numbers glued to words (e.g. FORTE364 -> FORTE 364)
    addr = re.sub(r'([A-Z]+)(\d+)', r'\1 \2', addr)
    
    # Remove block/apt/etc info at the end (e.g. "BL 1", "APTO 203", "ÚNICO", "UNICO", "TORRE K", etc)
    addr = re.sub(r'\s*-\s*(ÚNICO|UNICO|COMPLETO)$', '', addr)
    addr = re.sub(r'\s+(BL|BLOCO|BLC|AP|APTO|APT|CASA|LOJA|SL|SALA|KM|QD|LT|T|TORRE|APARTAMENTO)\b.*', '', addr, flags=re.IGNORECASE)
    
    # Remove multiple spaces
    addr = re.sub(r'\s+', ' ', addr).strip()

    # Correções de ortografia de ruas comuns para aumentar a taxa de geocodificação
    addr = addr.replace("AMELIA TELES", "AMELIA TELLES")
    addr = addr.replace("PROTASIO ALVEZ", "PROTASIO ALVES")
    addr = addr.replace("TAUPICK SAADI", "TAUPHICK SAADI")
    addr = addr.replace("FARIAS SANTOS", "FARIA SANTOS")
    
    return addr

def get_address_variations(raw_addr):
    variations = []
    
    # Base clean
    base_clean = clean_and_normalize(raw_addr)
    if not base_clean:
        return []
    
    # 1. Base clean as variation 1
    variations.append(base_clean)
    
    # Apply prefix replacement safely without leaving dots
    expanded = re.sub(r'^-?R\b\.?\s*', 'RUA ', base_clean, flags=re.IGNORECASE)
    expanded = re.sub(r'^AV\b\.?\s*', 'AVENIDA ', expanded, flags=re.IGNORECASE)
    expanded = re.sub(r'^TV\b\.?\s*', 'TRAVESSA ', expanded, flags=re.IGNORECASE)
    expanded = re.sub(r'^EST\b\.?\s*', 'ESTRADA ', expanded, flags=re.IGNORECASE)
    expanded = re.sub(r'^(PC|PRC)\b\.?\s*', 'PRAÇA ', expanded, flags=re.IGNORECASE)
    expanded = re.sub(r'^AC\b\.?\s*', 'ACESSO ', expanded, flags=re.IGNORECASE)
    expanded = re.sub(r'\s+', ' ', expanded).strip()
    
    # Dictionary of replacements for abbreviation expansion
    replacements = {
        r'\bBR\b': 'BARÃO',
        r'\bPRF\b': 'PROFESSOR',
        r'\bVSC\b': 'VISCONDE',
        r'\bCD\b': 'CONDE',
        r'\bDES\b': 'DESEMBARGADOR',
        r'\bREV\b': 'REVERENDO',
        r'\bDR\b': 'DOUTOR',
        r'\bDRA\b': 'DOUTORA',
        r'\bMNS\b': 'MONSENHOR',
        r'\bGEN\b': 'GENERAL',
        r'\bCEL\b': 'CORONEL',
        r'\bTCEL\b': 'TENENTE CORONEL',
        r'\bMAJ\b': 'MAJOR',
        r'\bCAP\b': 'CAPITÃO',
        r'\bTEN\b': 'TENENTE',
        r'\bSGT\b': 'SARGENTO',
        r'\bSTO\b': 'SANTO',
        r'\bSTA\b': 'SANTA',
        r'\bCNSO\b': 'CONSELHEIRO',
        r'\bCDOR\b': 'COMENDADOR',
        r'\bPRCA\b': 'PRINCESA',
    }
    
    # Apply abbreviation expansion
    for pattern, repl in replacements.items():
        expanded = re.sub(pattern, repl, expanded, flags=re.IGNORECASE)
    
    expanded = re.sub(r'\s+', ' ', expanded).strip()
    if expanded != base_clean:
        variations.append(expanded)
        
    # Apply typo corrections
    typos = {
        'GETULUIO': 'GETULIO',
        'PERREIRA': 'PEREIRA',
        'MATRIZ BARROS': 'MARIZ E BARROS',
        'ALVEZ': 'ALVES',
        'PROTASIO': 'PROTÁZIO',
        'TAUPICK': 'TAUFIK',
        'PERTERSEN': 'PETERSEN',
        'CRISTOFFEL': 'CRISTOFEL',
        'SCHIMIDT': 'SCHMIDT',
    }
    
    corrected = expanded
    for typo, correction in typos.items():
        corrected = corrected.replace(typo, correction)
        
    corrected = re.sub(r'\s+', ' ', corrected).strip()
    if corrected not in variations:
        variations.append(corrected)
        
    # Strip S/N or SN if present
    sn_stripped = re.sub(r'\s+\b(S/N|SN)\b', '', corrected, flags=re.IGNORECASE).strip()
    if sn_stripped not in variations:
        variations.append(sn_stripped)
        
    # Add street-only variations
    match = re.search(r'^(.*?)\s+\d+$', corrected)
    if match:
        street_only = match.group(1).strip()
        if street_only not in variations:
            variations.append(street_only)
            
    # Also for raw base_clean (street only)
    match_raw = re.search(r'^(.*?)\s+\d+$', base_clean)
    if match_raw:
        street_raw = match_raw.group(1).strip()
        if street_raw not in variations:
            variations.append(street_raw)

    # Prefixless and titleless variations
    prefixless = re.sub(r'^(RUA|AVENIDA|TRAVESSA|ESTRADA|PRAÇA|ACESSO)\s+', '', corrected, flags=re.IGNORECASE)
    if prefixless != corrected:
        if prefixless not in variations:
            variations.append(prefixless)
        match_pl = re.search(r'^(.*?)\s+\d+$', prefixless)
        if match_pl:
            pl_street = match_pl.group(1).strip()
            if pl_street not in variations:
                variations.append(pl_street)
                
        # Title stripped prefixless
        raw_name = re.sub(r'^(DESEMBARGADOR|DOUTOR|DOUTORA|PROFESSOR|BARÃO|VISCONDE|CONDE|CORONEL|GENERAL|REVERENDO|PADRE|PRESIDENTE|GOVERNADOR|MINISTRO|SENADOR|PREFEITO)\s+', '', prefixless, flags=re.IGNORECASE)
        if raw_name != prefixless:
            if raw_name not in variations:
                variations.append(raw_name)
            match_rn = re.search(r'^(.*?)\s+\d+$', raw_name)
            if match_rn:
                rn_street = match_rn.group(1).strip()
                if rn_street not in variations:
                    variations.append(rn_street)
            
    # Try truncated street names for long names
    for name_variant in [prefixless, raw_name if 'raw_name' in locals() else prefixless]:
        # Strip number if any (to work on street name only)
        street_name = re.sub(r'\s+\d+$', '', name_variant).strip()
        words = street_name.split()
        if len(words) > 2:
            trunc2 = " ".join(words[:2])
            trunc3 = " ".join(words[:3])
            if trunc2 not in variations:
                variations.append(trunc2)
            if trunc3 not in variations:
                variations.append(trunc3)
            
    return variations

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

def save_js_data(js_path, rows_data, generated_at, new_geocodes_count):
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

            # ── LÓGICA DE GEOCODIFICAÇÃO COM MÚLTIPLAS TENTATIVAS (VARREDURA DE ABREVIAÇÕES/TYPOS) ──
            uf = get_uf(cidade)
            lat, lng = None, None
            geocodificado = False

            # Gerar todas as variações de escrita do endereço (do mais completo ao mais simplificado)
            variations = get_address_variations(endereco)
            
            for var in variations:
                geo_key = f"{var}, {cidade}, {uf}, Brazil".upper()
                
                # A. Tenta buscar do cache primeiro
                if geo_key in cache:
                    coords = cache[geo_key]
                    if coords:
                        lat, lng = coords[0], coords[1]
                        geocodificado = True
                        break
                    # Se for None, significa que já foi consultado no Nominatim e falhou, então continuamos para a próxima variação
                    continue
                
                # B. Se não está no cache e estamos dentro do limite de requisições, faz a geocodificação
                if new_geocodes_count < max_new_geocodes:
                    print(f"[{idx+1}/{total_rows}] Buscando no Nominatim: {geo_key}")
                    coords = geocode_address(geo_key, cache)
                    new_geocodes_count += 1
                    save_cache(cache) # Salva o cache imediatamente
                    time.sleep(1) # Intervalo obrigatório de 1s do Nominatim
                    
                    if coords:
                        lat, lng = coords[0], coords[1]
                        geocodificado = True
                        break
            
            # C. Fallback: Se nenhuma variação resolveu, tenta o centro da cidade
            if lat is None or lng is None:
                coords = CITY_COORDINATES.get(cidade, CITY_COORDINATES["NÃO DEFINIDA"])
                lat, lng = coords[0], coords[1]
                geocodificado = False

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
                "lng": lng,
                "geocodificado": geocodificado,
                "obs_baixa": row[33].strip(),
                "obs_vistoria": row[21].strip(),
                "data_adicio": row[16].strip()
            }
            rows_data.append(item)
            if (idx + 1) % 50 == 0:
                save_js_data(js_path, rows_data, generated_at, new_geocodes_count)

    # Escrever no arquivo JS final
    save_js_data(js_path, rows_data, generated_at, new_geocodes_count)
    print(f"Sucesso: {len(rows_data)} registros MDU processados e escritos em {js_path}")

if __name__ == "__main__":
    process_mdu()
