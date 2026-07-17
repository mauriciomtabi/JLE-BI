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
    addr = addr.replace("PERPETUA TELES", "PERPETUA TELLES")
    addr = addr.replace("TELES", "TELLES")
    addr = addr.replace("PROTASIO ALVEZ", "PROTASIO ALVES")
    addr = addr.replace("TAUPICK SAADI", "TAUPHICK SAADI")
    addr = addr.replace("FARIAS SANTOS", "FARIA SANTOS")
    addr = addr.replace("JOAO WALIG", "JOAO WALLIG")
    addr = addr.replace("COSNTANT", "CONSTANT")
    addr = addr.replace("COSTANT", "CONSTANT")
    addr = addr.replace("IDELFONSO", "ILDEFONSO")
    addr = addr.replace("BRA DO GRAVATAI", "BARAO DO GRAVATAI")
    addr = addr.replace("PC CON MARCELINO", "PRACA CONEGO MARCELINO")
    addr = addr.replace("CASSEMIRO", "CASEMIRO")
    addr = addr.replace("LEÃO XIII", "LEAO 13")
    addr = addr.replace("LEAO XIII", "LEAO 13")
    addr = addr.replace("MATRIS BARROS", "MARIZ E BARROS")
    addr = addr.replace("POLHMAM", "POHLMANN")
    addr = addr.replace("DOMIGOS", "DOMINGOS")
    addr = addr.replace("MOTEIRO", "MONTEIRO")
    addr = addr.replace("R LUIS MANOES GONZAGA", "AV LUIZ MANOEL GONZAGA")
    addr = addr.replace("R LUIZ MANOEL GONZAGA", "AV LUIZ MANOEL GONZAGA")
    addr = addr.replace("LUIS MANOES GONZAGA", "LUIZ MANOEL GONZAGA")
    addr = addr.replace("LUIS MANOES", "LUIZ MANOEL")
    addr = addr.replace("MAESTO", "MAESTRO")
    addr = addr.replace("DEL JAHIR", "DELEGADO JAHIR")
    addr = addr.replace("INICENCIA", "INOCENCIA")
    addr = addr.replace("ROMANGUERA", "ROMAGUERA")
    addr = addr.replace("CV JACUI", "AV JACUI")
    addr = addr.replace("PERI MACHADO", "PERY MACHADO")
    addr = addr.replace("MENACHEN", "MENACHEM")
    addr = addr.replace("GERONIMO", "JERONIMO")
    addr = addr.replace("ME BARBADA MAIX", "MADRE BARBARA MAIX")
    addr = addr.replace("BARBADA MAIX", "BARBARA MAIX")
    addr = addr.replace("PRE F ROOSEVELT", "PRESIDENTE FRANKLIN ROOSEVELT")
    addr = addr.replace("PRESSIDENTE", "PRESIDENTE")
    addr = addr.replace("ALEXANDRE ANEL", "ALEXANDRE SNEL")
    addr = addr.replace("D AZEVEDO", "D'AZEVEDO")
    addr = addr.replace("DE AZEVEDO", "D'AZEVEDO")
    addr = addr.replace("MARCELLO", "MARCELO")
    addr = addr.replace("LIBERA", "LIBERO")
    addr = addr.replace("CONSTANTE", "CONSTANT")
    addr = addr.replace("MIGUEL TOSTE", "MIGUEL TOSTES")
    addr = addr.replace("MIGUEL TOTE", "MIGUEL TOSTES")
    addr = addr.replace("TOSTESS", "TOSTES")

    # Split prefixes missing space (e.g. AVLAVRAS -> AV LAVRAS)
    addr = re.sub(r'^AVLAVRAS\b', 'AV LAVRAS', addr)
    addr = re.sub(r'^AVIPIRANGA\b', 'AV IPIRANGA', addr)
    
    # Standardize common abbreviations
    addr = re.sub(r'\bVER\b\.?\s*', 'VEREADOR ', addr)
    
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
    # Override manual para Pedro Pohlmann
    if "PEDRO POHLMANN" in address_str.upper():
        coords = [-29.6953, -51.1014]
        cache[address_str] = coords
        print(f"  Geocodificado com override manual (Pedro Pohlmann): {address_str} -> {coords}")
        return coords
        
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

def normalize_header(h):
    h = h.lower().strip()
    h = h.replace('\n', ' ').replace('\r', ' ')
    replacements = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'â': 'a', 'ê': 'e', 'ô': 'o',
        'ã': 'a', 'õ': 'o',
        'ç': 'c',
        'º': '', 'ª': '',
        ' ': ''
    }
    for k, v in replacements.items():
        h = h.replace(k, v)
    return h

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

        header_map = {}
        for i_h, h in enumerate(headers):
            norm = normalize_header(h)
            header_map[norm] = i_h

        def get_col(row, header_name, default_idx):
            norm = normalize_header(header_name)
            idx = header_map.get(norm)
            if idx is not None and idx < len(row):
                return row[idx].strip()
            actual_idx = default_idx
            if "pendencia?" in header_map and default_idx >= 8:
                actual_idx = default_idx + 1
            if actual_idx < len(row):
                return row[actual_idx].strip()
            return ""

        # Filtrar linhas válidas antes para podermos fazer uma barra de progresso simples
        os_idx = header_map.get(normalize_header("OS JLE"), 2)
        valid_rows = []
        for row in reader:
            if row and len(row) > os_idx and row[os_idx].strip():
                valid_rows.append(row)

        total_rows = len(valid_rows)
        print(f"Processando {total_rows} registros...")

        for idx, row in enumerate(valid_rows):
            # Garantir que a linha tenha colunas suficientes para não quebrar
            while len(row) < 55:
                row.append('')

            os_val = get_col(row, "OS JLE", 2)
            endereco = get_col(row, "Endereço", 3)
            cidade = get_col(row, "Cidade", 4).upper()
            cluster = get_col(row, "Cluster", 5).upper()

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
                
                # Overrides manuais para ruas corretas mas não presentes no OpenStreetMap/Nominatim
                if "PEDRO POHLMANN" in geo_key:
                    lat, lng = -29.6953, -51.1014
                    geocodificado = True
                    break
                elif "ORLANDO AITA" in geo_key or "ORLANDO AYTA" in geo_key:
                    lat, lng = -30.01851, -51.11135
                    geocodificado = True
                    break
                elif "ALEXANDRE SNEL" in geo_key or "ALEXANDRE ANEL" in geo_key:
                    lat, lng = -30.07395, -51.20304
                    geocodificado = True
                    break
                    
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
                "aging": get_col(row, "Aging", 6),
                "relatorio_por": get_col(row, "Quem fez Relatório", 7),
                "pendencia": get_col(row, "Pendência?", 8),
                "status": get_col(row, "Status", 8),
                "prog": clean_percentage(get_col(row, "Prog. %", 9)),
                "cod_imovel": get_col(row, "Cód. Imóvel", 10),
                "area": get_col(row, "Área", 11),
                "node": get_col(row, "Node", 12),
                "caixa_m": get_col(row, "Caixa M", 13),
                "hps": clean_int(get_col(row, "HPs", 14)),
                "equipe": get_col(row, "Equipe", 17),
                "primeira_visita": get_col(row, "Primeira Visita", 18),
                "segunda_visita": get_col(row, "Segunda Visita", 19),
                "data_interna": get_col(row, "Data Interna", 29),
                "data_fusao": get_col(row, "Data Fusão", 30),
                "data_baixa": get_col(row, "Data Baixa", 32),
                "data_relatorio": get_col(row, "Data Relatório", 34),
                "data_medicao": get_col(row, "Data Medição", 38),
                "valor_medicao": clean_currency(get_col(row, "Valor Medição", 39)),
                "valor_repasse": clean_currency(get_col(row, "Valor Repasse", 45)),
                "lat": lat,
                "lng": lng,
                "geocodificado": geocodificado,
                "obs_baixa": get_col(row, "Observações Baixa", 33),
                "obs_vistoria": get_col(row, "Observações Vistoria", 21),
                "data_adicio": get_col(row, "Data Adicio.", 16)
            }
            rows_data.append(item)
            if (idx + 1) % 50 == 0:
                save_js_data(js_path, rows_data, generated_at, new_geocodes_count)

    # Escrever no arquivo JS final
    save_js_data(js_path, rows_data, generated_at, new_geocodes_count)
    print(f"Sucesso: {len(rows_data)} registros MDU processados e escritos em {js_path}")

if __name__ == "__main__":
    process_mdu()
