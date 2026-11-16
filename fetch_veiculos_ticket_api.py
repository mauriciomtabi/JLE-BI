#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_veiculos_ticket_api.py
----------------------------
Script de integracao da API Ticket Log (Good Card / GoodManager) para o
Dashboard de Veiculos / Abastecimento da JLE Telecom.

Consome o endpoint REST /ticketlog-servicos/ebs/transacaoVeiculo/search
e compila os registros diretamente para veiculos_data.js, mantendo total compatibilidade
com o frontend existente e gerando cache de contingencia local.
"""

import os
import sys
import json
import base64
import argparse
import datetime
import urllib.request
import urllib.error
import re
from pathlib import Path

# Configuracao de encoding no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPT_DIR / ".env.local"
DATA_JS_FILE = SCRIPT_DIR / "veiculos_data.js"
LOCAL_XLSX_FILE = SCRIPT_DIR / "veiculos_local.xlsx"

DEFAULT_BASE_URL = "https://srv1.ticketlog.com.br"
DEFAULT_CLIENT_ID = 186943
DEFAULT_PRODUCT_CODE = 4 # 4 = Fleet, 5 = CAR

MONTH_NAMES = {
    1: "JANEIRO",
    2: "FEVEREIRO",
    3: "MARÇO",
    4: "ABRIL",
    5: "MAIO",
    6: "JUNHO",
    7: "JULHO",
    8: "AGOSTO",
    9: "SETEMBRO",
    10: "OUTUBRO",
    11: "NOVEMBRO",
    12: "DEZEMBRO"
}

# Mapeamento oficial de Centro de Custo / Lotação de Registro (RS, SC, PR)
# Baseado nas listas de RH / DP, contratos e grupos de restrição da Ticket Log
DRIVER_COST_CENTER = {
    "ADRIANO SANTOS DE PROENCA": "PR",
    "ALDAIR DE OLIVEIRA RODRIGUES": "RS",
    "ALESSANDRO MIRANDA DOS SANTOS": "SC",
    "ALEXANDRE ALVES": "SC",
    "AMIZAEL ROMILIO DO SANTOS": "RS",
    "ANDRE KRAEMER": "SC",
    "ANTONIO CARLOS SCHOARTZ": "SC",
    "ANTONIO CARLOS VIEIRA": "PR",
    "APARECIDO CERVANTES JUNIOR": "PR",
    "BRUNO LUIZ SIQUEIRA OLIVEIRA": "SC",
    "BRUNO LUIZ SIQUERA OLIVEIRA": "SC",
    "BRUNO MACIEL SOUSA DA SILVA": "RS",
    "BRUNO MILLER LOPES DA SILVA": "SC",
    "BRUNO REMOR NETO": "PR",
    "CARLOS EDUARDO DOS SANTOS": "SC",
    "CAUA DIAS OLICHESKI DA SILVA": "RS",
    "CLAUDIO ANDRE LEVINSKI": "RS",
    "CLAUDIO DE SOUZA ASSUNCAO": "SC",
    "CLICEU JOSE VIEIRA DE OLIVEIRA": "PR",
    "CRISTIAN MEDEIROS SILVEIRA": "SC",
    "DANIEL GERSON GELINSKI": "SC",
    "DEIVID PERES CARVALHO": "RS",
    "DENILSON BARBOSA": "SC",
    "DIONATAN FERREIRA": "RS",
    "DJON LENON DA SILVEIRA DAVILA": "RS",
    "DLAGLAYSCH CORREA CALDEIRA": "SC",
    "EDISON SILVA CARDOZO": "RS",
    "EDIVALDO ALEX DE LIMA": "SC",
    "EDSON SANTOS DE BARROS": "SC",
    "EDUARDO ROSA DA COSTA": "RS",
    "EVANDRO MARCOS RAIMUNDI": "SC",
    "EVERSON LUIS DOS SANTOS": "SC",
    "EVERTON GOULART ZANIRATI": "RS",
    "FABIO VITOR VEDOY": "SC",
    "FELIPE MORANDO": "SC",
    "FERNANDO GONCALVES": "SC",
    "GEOVANE AMORAS AMANAJAS JUNIOR": "SC",
    "GILMAR TONINE": "PR",
    "GISELE COELHO": "SC",
    "GREGORY PEREIRA DA SILVA": "RS",
    "HENRIQUE THAINA DOS SANTOS MATOS": "SC",
    "HERICKSON JOSE ROCHA TEIXEIRA": "SC",
    "ILMAR FONTES VIEIRA FILHO": "SC",
    "JAIRO LOI BRAZ DA SILVA": "SC",
    "JEAN MARCOS RODRIGUES": "SC",
    "JOACIR DOS SANTOS": "SC",
    "JOAO CARLOS DA SILVA RODRIGUES": "RS",
    "JONATHAN TIAGO VISSOTTO": "SC",
    "JOSMAR TEIXEIRA": "RS",
    "JUAREZ DE MOURA MACHADO": "RS",
    "JULIAN CARLOS LINO": "SC",
    "JULIANO KLAUS ENGEL": "SC",
    "JUNIOR CESAR DE OLIVEIRA MUNIZ": "SC",
    "KAUE GABRIEL KELLER DE ALMEIDA": "RS",
    "LAURO RODRIGUES DOS SATOS PEREIRA": "SC",
    "LEANDRO DANIEL DE ALMEIDA DUTRA": "RS",
    "LEANDRO MARQUES DE OLIVEIRA": "RS",
    "LUCAS DANIEL GELINSKI": "SC",
    "LUIZ H. ARANTE": "SC",
    "MALCOLM FABIANO ALVES SOARES": "RS",
    "MARCEL DIAS DILLI": "SC",
    "MARCELO DA SILVA": "RS",
    "MARCIO JONAS DORNELLES OLIVEIRA": "SC",
    "MARCO ANTONIO DA SILVA DOS REIS": "RS",
    "MARCOS ANDRE FONSECA DA LUZ DE MELLOS": "RS",
    "MARCOS DE OLIVEIRA ANDRADE": "SC",
    "MARCOS VINICIUS DE ALMEIDA DUTRA": "RS",
    "MARIO FREIRE TEOFILO": "SC",
    "MARLON EWALDO ZIMMERMANN": "RS",
    "MAYCKON MEIRA DOS SANTOS": "SC",
    "NILTON TALASKA": "RS",
    "ONOFRE TEODORO JUNIOR": "SC",
    "PAULO ROBERTO DEGRACIA": "SC",
    "PAULO VITOR CRUZ MARTINS": "RS",
    "RAFAEL BARBAGLI": "RS",
    "RAFAEL KOHLRAUSCH": "RS",
    "RAUL CHRLLES RODRIGUES DOS SANTOS": "RS",
    "RENATO JOSE KINAPE": "SC",
    "RICARDO DA SILVA GUEDES": "RS",
    "ROBSON CANDIDA DE OLIVEIRA": "SC",
    "ROBSON PEDROSO DE ALMEIDA JUNIOR": "SC",
    "RODRIGO CRISTIANO MALESKI": "SC",
    "RODRIGO MOLINA BRAGA": "SC",
    "SIDINEI DA SILVA KELLER": "RS",
    "SILVIO NORONHA DE BARROS": "RS",
    "TAHYLLER KELLER ALMEIDA": "RS",
    "TIAGO TORRES BICCA LINDEMAYER": "RS",
    "VALDECIR FRAGOSO": "PR",
    "VALDEMAR LUIS STURMER": "RS",
    "VINICIUS PEREIRA MARQUES": "RS",
    "VINICIUS SAMPAIO RODRIGUES": "RS",
    "WARGER RICARDO TEODORO": "SC",
    "WESLEY DA ROSA": "RS",
    "WESLEY PEREIRA GUIMARAES": "SC",
    "WIDSON GONCALVES DOS SANTOS": "PR"
}

PLATE_COST_CENTER = {
    "ABJ5E17": "PR", "AFR9H26": "RS", "AOI4F25": "PR", "ARK8H33": "SC",
    "ASD4998": "PR", "ASL1041": "PR", "ATY7I93": "PR", "AVP5083": "SC",
    "AWT5141": "PR", "AYL8H92": "SC", "AZW3J83": "SC", "BAM4B79": "RS",
    "BAV2F37": "SC", "BCT4E50": "RS", "BEE1H52": "SC", "COR0001": "RS",
    "COR0002": "SC", "COR0003": "RS", "FST1C03": "RS", "HJB8B91": "SC",
    "HLH1C45": "RS", "IKX0C42": "SC", "IMD6H27": "RS", "IMM4770": "RS",
    "INJ8B61": "SC", "IPB7E02": "RS", "IRB3F50": "PR", "IRK9908": "RS",
    "IRU9400": "RS", "ISH0C70": "RS", "ITJ5E67": "SC", "ITW7E02": "SC",
    "IUI8A63": "RS", "IUR8522": "RS", "IVF2B35": "RS", "IVL0A82": "SC",
    "IVR1I76": "SC", "IVR2035": "SC", "IWY8G48": "SC", "IXB6183": "PR",
    "IXR2A86": "RS", "IYJ5I82": "RS", "IYO1713": "RS", "IYT0F70": "SC",
    "JAZ9A81": "SC", "JDN4D75": "SC", "JDN4D87": "RS", "JDN5D91": "SC",
    "JDN5E06": "SC", "KWY3F20": "SC", "MDM3E76": "SC", "MDO8383": "SC",
    "MDV8B14": "SC", "MFS7382": "SC", "MGW9835": "SC", "MHJ8138": "RS",
    "MIH7E15": "RS", "MIS4573": "SC", "MJV3421": "SC", "MKQ1B69": "SC",
    "MLY8323": "SC", "MMF4B58": "RS", "MMM5C84": "RS", "NFR8B20": "RS",
    "NJZ2D60": "RS", "OAL5766": "SC", "OPN1A38": "RS", "PHM1208": "SC",
    "PYD3520": "RS", "PZP2901": "SC", "QDP7C43": "SC", "QHA7J87": "SC",
    "QHI1I53": "SC", "QHJ5H03": "SC", "QHT2I74": "SC", "QHY2C33": "SC",
    "QNZ1F16": "SC", "QNZ1F23": "RS", "QOU3G09": "SC", "QQZ5A70": "SC",
    "QUS5A22": "SC", "QXB2J54": "SC", "QXB2J58": "SC", "QXP1A56": "RS",
    "RMR8362": "RS", "RVY7J50": "SC", "SEG3F75": "SC"
}


def resolve_cost_center(driver, plate, restriction_group=None, station_uf=None):
    """
    Determina o Centro de Custo / Lotação de Registro do colaborador (RS, SC, PR).
    Prioridades:
    1. Nome do motorista mapeado
    2. Placa do veículo mapeada
    3. Grupo de restrição da Ticket Log
    4. Fallback: UF do posto abastecido
    """
    if driver and str(driver).strip().upper() in DRIVER_COST_CENTER:
        return DRIVER_COST_CENTER[str(driver).strip().upper()]

    clean_p = re.sub(r"[^A-Z0-9]", "", str(plate or "").upper())
    if clean_p and clean_p in PLATE_COST_CENTER:
        return PLATE_COST_CENTER[clean_p]

    if restriction_group:
        rg = str(restriction_group).upper()
        if "SANTA CATARINA" in rg:
            return "SC"
        if "PARANA" in rg:
            return "PR"
        if "GERAL" in rg or "DIRETORIA" in rg:
            return "RS"

    if station_uf and str(station_uf).strip().upper() in ("RS", "SC", "PR"):
        return str(station_uf).strip().upper()

    return "RS"


def load_env_file():
    """Carrega variaveis de .env.local se existirem."""
    if not ENV_FILE.exists():
        return
    try:
        with open(ENV_FILE, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k not in os.environ:
                    os.environ[k] = v
    except Exception as e:
        print(f"[AVISO] Nao foi possivel ler .env.local: {e}")


def get_auth_header():
    """Obtem o header de autorizacao HTTP Basic."""
    # 1. Header completo ou token pronto
    basic_auth = os.environ.get("TICKET_API_BASIC_AUTH") or os.environ.get("TICKET_API_AUTHORIZATION")
    if basic_auth:
        if not basic_auth.lower().startswith("basic "):
            basic_auth = f"Basic {basic_auth}"
        return basic_auth

    # 2. Usuario e senha
    user = os.environ.get("TICKET_API_USERNAME") or os.environ.get("TICKET_API_USER")
    pwd = os.environ.get("TICKET_API_PASSWORD") or os.environ.get("TICKET_API_PASS")
    if user and pwd:
        token = base64.b64encode(f"{user}:{pwd}".encode("utf-8")).decode("ascii")
        return f"Basic {token}"

    return None


def parse_date(date_str):
    """Converte strings de data da API Ticket para datetime."""
    if not date_str:
        return None
    date_str = str(date_str).strip()
    # Formatos comuns da API: "2026-09-30 20:36:47", "2026-09-30T20:36:47", "2026-09-30"
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(date_str[:19], fmt)
        except ValueError:
            pass
    return None


def clean_number(val, default=None):
    """Converte valor para float arredondado."""
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return round(float(val), 2)
    s = str(val).replace("R$", "").replace(" ", "").replace("\t", "")
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except Exception:
        return default


def clean_int(val, default=None):
    """Converte valor para inteiro."""
    if val is None or val == "":
        return default
    try:
        return int(float(str(val).replace(",", ".").strip()))
    except Exception:
        return default


def fetch_ticket_api_transactions(auth_header, client_id, product_code, start_date_str, end_date_str, base_url=DEFAULT_BASE_URL):
    """
    Executa chamada POST no endpoint de Relatorio Analitico de Transacoes Auditadas.
    """
    endpoint = f"{base_url.rstrip('/')}/ticketlog-servicos/ebs/transacaoVeiculo/search?codigoCliente={int(client_id)}&codigoProduto={int(product_code)}"
    payload = {
        "codigoCliente": int(client_id),
        "codigoProduto": int(product_code),
        "codigoTipoCartao": int(product_code),
        "dataTransacaoInicial": f"{start_date_str}T00:00:00",
        "dataTransacaoFinal": f"{end_date_str}T23:59:59",
        "considerarTransacao": "T",
        "ordem": "T"
    }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": auth_header,
        "User-Agent": "BI-JLE-Telecom/1.0"
    }

    print(f"Chamando API Ticket Log...")
    print(f"  URL: {endpoint}")
    print(f"  Periodo: {start_date_str} ate {end_date_str}")
    print(f"  Cliente: {client_id} | Produto: {product_code}")

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(endpoint, data=req_data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
            print(f"Resposta recebida com sucesso (Status HTTP: {status}).")
            data = json.loads(body)
            return data
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        print(f"[ERRO HTTP] {e.code} {e.reason}: {err_body}")
        raise
    except Exception as e:
        print(f"[ERRO CONEXAO] {e}")
        raise


def normalize_api_items(items):
    """
    Transforma a lista de itens da API no formato padrao do VEICULOS_DATA.
    """
    records = []
    for item in items:
        # Tratamento de data
        dt_raw = item.get("dataTransacao") or item.get("dataHora") or item.get("data")
        dt = parse_date(dt_raw)
        if not dt:
            continue

        plate = str(item.get("placa") or item.get("placaVeiculo") or "").strip().upper()
        if not plate or plate == "TOTAL":
            continue

        driver = str(item.get("nomeMotorista") or item.get("nomeCompleto") or item.get("motorista") or "").strip().upper()
        if driver == "TOTAL":
            continue

        val = clean_number(item.get("valorTransacao") if "valorTransacao" in item else item.get("itemValorTransacao"), None)
        liters = clean_number(item.get("itemLitros") or item.get("litros"))
        vl_liter = clean_number(item.get("itemValorServicoUnitario") or item.get("vlLitro") or item.get("valorLitro"))
        model = str(item.get("veiculoModelo") or item.get("descricaoModeloVeiculo") or item.get("modeloVeiculo") or item.get("modelo") or "").strip()
        fuel = str(item.get("descricaoTipoCombustivel") or item.get("tipoCombustivel") or item.get("combustivel") or "").strip().upper()
        fleet = str(item.get("descricaoTipoFrota") or item.get("tipoFrota") or "PROPRIA").strip().upper()
        
        km = clean_int(item.get("quilometragem") if "quilometragem" in item else item.get("itemQuilometragem"))
        km_ant = clean_int(item.get("itemQuilometragemAnterior"))
        
        # Calculo de KM/L
        kml = clean_number(item.get("quilometrosPorLitro") if "quilometrosPorLitro" in item else item.get("kmPorLitro") or item.get("kmLitro"))
        if kml is None and km is not None and km_ant is not None and liters and liters > 0:
            diff_km = km - km_ant
            if diff_km > 0:
                kml = round(diff_km / liters, 2)

        uf = str(item.get("codigoUF") or item.get("uf") or item.get("siglaUF") or "").strip().upper()
        restr_group = item.get("grupoRestricaoVeiculo") or item.get("grupoRestricaoTransacao")
        cost_center = resolve_cost_center(driver, plate, restr_group, uf)

        month_name = MONTH_NAMES.get(dt.month, "N/D")

        rec = {
            "date": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "plate": plate,
            "driver": driver,
            "value": val,
            "uf": uf,
            "costCenter": cost_center,
            "month": month_name,
            "liters": liters,
            "vlLiter": vl_liter,
            "model": model,
            "fuel": fuel,
            "fleet": fleet,
            "km": km,
            "kml": kml
        }
        if item.get("codigoTransacao") is not None:
            rec["transactionId"] = str(item["codigoTransacao"])
        records.append(rec)

    return records


def fetch_period(auth_header, client_id, product_code, start_date, end_date, base_url):
    """O servico Ticket limita cada consulta a um dia; falha antes de gravar se algum dia falhar."""
    items = []
    day = start_date
    while day <= end_date:
        result = fetch_ticket_api_transactions(auth_header, client_id, product_code,
                                              day.isoformat(), day.isoformat(), base_url)
        if not isinstance(result, dict) or result.get("sucesso") is not True:
            raise ValueError(f"Consulta de {day} falhou: {result.get('codigoErro') if isinstance(result, dict) else 'resposta invalida'}")
        transactions = result.get("transacoes", [])
        if not isinstance(transactions, list):
            raise ValueError(f"Lista de transacoes invalida em {day}.")
        items.extend(transactions)
        day += datetime.timedelta(days=1)
    return {"sucesso": True, "transacoes": items}


def read_existing_veiculos_data():
    """Le os dados historicos de veiculos_data.js."""
    if not DATA_JS_FILE.exists():
        return []
    try:
        with open(DATA_JS_FILE, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if "VEICULOS_DATA = " in content:
            raw_json = content.split("VEICULOS_DATA = ")[1].rstrip(";\n ")
            return json.loads(raw_json)
    except Exception as e:
        raise ValueError("Historico ilegivel; atualizacao interrompida para preservar os dados.") from e
    raise ValueError("Formato do historico nao reconhecido; nenhum dado foi alterado.")


def merge_and_save_data(new_records, start_date, end_date):
    """
    Mescla novos registros com o historico existente de veiculos_data.js,
    preservando meses anteriores e evitando duplicatas.
    """
    existing_records = read_existing_veiculos_data()
    print(f"Total de registros historicos existentes: {len(existing_records)}")

    # Substitui somente o intervalo consultado, incluindo o ano.
    def outside_period(record):
        dt = parse_date(record.get("date"))
        if dt is None:
            raise ValueError("Data invalida no historico; atualizacao interrompida.")
        return not start_date <= dt.date() <= end_date

    preserved = [r for r in existing_records if outside_period(r)]
    print(f"Registros de outros meses preservados: {len(preserved)}")

    # Evita duplicidades exatas na mesclagem
    seen_keys = set()
    final_list = []
    
    # 1. Adiciona os preservados
    for r in preserved:
        key = (r.get("transactionId"), r.get("date"), r.get("plate"), r.get("fuel"), r.get("value"), r.get("liters"))
        seen_keys.add(key)
        final_list.append(r)

    # 2. Adiciona os novos da API
    added_new = 0
    for r in new_records:
        key = (r.get("transactionId"), r.get("date"), r.get("plate"), r.get("fuel"), r.get("value"), r.get("liters"))
        if key not in seen_keys:
            seen_keys.add(key)
            final_list.append(r)
            added_new += 1

    # Ordena cronologicamente por data
    final_list.sort(key=lambda x: str(x.get("date") or ""))

    print(f"Novos registros inseridos: {added_new}")
    print(f"Total consolidado final em veiculos_data.js: {len(final_list)}")

    # Salva veiculos_data.js
    temp_file = DATA_JS_FILE.with_suffix(".js.tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        f.write(f"const VEICULOS_DATA = {json.dumps(final_list, ensure_ascii=False, indent=2)};\n")
    temp_file.replace(DATA_JS_FILE)

    print(f"Arquivo {DATA_JS_FILE.name} gravado com sucesso!")
    return final_list


def export_contingency_cache(records):
    """
    Gera/atualiza veiculos_local.xlsx em contingencia se openpyxl estiver instalado.
    """
    try:
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Transacoes"
        
        headers = [
            "DATA TRANSACAO", "PLACA", "NOME MOTORISTA", "CENTRO DE CUSTO", "VALOR EMISSAO", "UF POSTO",
            "LITROS", "VL/LITRO", "MODELO VEICULO", "TIPO COMBUSTIVEL", "TIPO FROTA",
            "HODOMETRO OU HORIMETRO", "KM/LITRO OU LITROS/HORA"
        ]
        ws.append(headers)
        
        for r in records:
            ws.append([
                r.get("date"),
                r.get("plate"),
                r.get("driver"),
                r.get("costCenter") or r.get("uf"),
                r.get("value"),
                r.get("uf"),
                r.get("liters"),
                r.get("vlLiter"),
                r.get("model"),
                r.get("fuel"),
                r.get("fleet"),
                r.get("km"),
                r.get("kml")
            ])
            
        wb.save(LOCAL_XLSX_FILE)
        print(f"Cache de contingencia atualizado: {LOCAL_XLSX_FILE.name}")
    except Exception as e:
        print(f"[AVISO] Nao foi possivel gerar {LOCAL_XLSX_FILE.name}: {e}")


def main():
    parser = argparse.ArgumentParser(description="Atualiza dados de veiculos via Ticket Log API")
    parser.add_argument("--start-date", help="Data inicial no formato YYYY-MM-DD")
    parser.add_argument("--end-date", help="Data final no formato YYYY-MM-DD")
    parser.add_argument("--months-back", type=int, default=1, help="Numero de meses anteriores para buscar")
    parser.add_argument("--dry-run", action="store_true", help="Apenas testa a chamada sem salvar")
    args = parser.parse_args()
    if bool(args.start_date) != bool(args.end_date):
        parser.error("Informe --start-date e --end-date juntos.")
    if args.months_back < 0:
        parser.error("--months-back nao pode ser negativo.")

    load_env_file()

    auth_header = get_auth_header()
    if not auth_header:
        print("[ERRO] Credenciais da Ticket API nao encontradas!")
        print("Configure no arquivo .env.local:")
        print("  TICKET_API_BASIC_AUTH=\"Basic seu_token_base64\"")
        print("ou:")
        print("  TICKET_API_USERNAME=\"seu_usuario\"")
        print("  TICKET_API_PASSWORD=\"sua_senha\"")
        sys.exit(2)

    client_id = os.environ.get("TICKET_API_CLIENT_ID", DEFAULT_CLIENT_ID)
    product_code = os.environ.get("TICKET_API_PRODUCT_CODE", DEFAULT_PRODUCT_CODE)
    base_url = os.environ.get("TICKET_API_BASE_URL", DEFAULT_BASE_URL)

    # Definicao do periodo de busca
    today = datetime.date.today()
    if args.start_date and args.end_date:
        start_date_str = args.start_date
        end_date_str = args.end_date
    else:
        # Padrao: busca desde o inicio do mes anterior ate a data de hoje
        first_day = today.replace(day=1)
        for _ in range(args.months_back):
            first_day = (first_day - datetime.timedelta(days=1)).replace(day=1)
        start_date_str = first_day.isoformat()
        end_date_str = today.strftime("%Y-%m-%d")

    start_date = datetime.date.fromisoformat(start_date_str)
    end_date = datetime.date.fromisoformat(end_date_str)
    if start_date > end_date:
        parser.error("Data inicial posterior a data final.")

    try:
        response_data = fetch_period(
            auth_header=auth_header,
            client_id=client_id,
            product_code=product_code,
            start_date=start_date,
            end_date=end_date,
            base_url=base_url
        )

        items = []
        if isinstance(response_data, dict):
            if response_data.get("sucesso") is not True:
                raise ValueError("API nao confirmou sucesso; os dados atuais foram preservados.")
            if not isinstance(response_data.get("transacoes"), list):
                raise ValueError("Resposta sem lista de itens valida.")
            items = response_data["transacoes"]
        elif isinstance(response_data, list):
            items = response_data

        print(f"Itens retornados pela API: {len(items)}")

        if not items:
            print("[AVISO] API sem transacoes. Base anterior preservada para conferencia.")
            sys.exit(1)

        normalized = normalize_api_items(items)
        if len(normalized) != len(items):
            raise ValueError("Existem transacoes nao reconhecidas; nenhum dado foi substituido.")
        if any(not start_date <= parse_date(r["date"]).date() <= end_date for r in normalized):
            raise ValueError("API retornou transacoes fora do intervalo solicitado.")
        if any(not r.get("uf") or not r.get("value") for r in normalized):
            raise ValueError("Resposta sem UF ou valor validado; necessario conferir o contrato da API antes da importacao.")
        print(f"Transacoes validas normalizadas: {len(normalized)}")

        if args.dry_run:
            print("[DRY-RUN] Nenhuma alteracao foi gravada em disco.")
            if normalized:
                print("Exemplo do primeiro registro formatado:")
                print(json.dumps(normalized[0], indent=2, ensure_ascii=False))
            sys.exit(0)

        consolidated = merge_and_save_data(normalized, start_date, end_date)
        export_contingency_cache(consolidated)
        sw_file = SCRIPT_DIR / "sw.js"
        sw_content = sw_file.read_text(encoding="utf-8")
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        sw_content = re.sub(r"const CACHE_NAME = '[^']+';",
                            f"const CACHE_NAME = 'jle-bi-ticket.{timestamp}';", sw_content)
        sw_content = re.sub(r"// Versao: [^\n]+", f"// Versao: {timestamp} Ticket API", sw_content)
        sw_file.write_text(sw_content, encoding="utf-8")
        print("Sincronizacao da API Ticket Log concluida com sucesso!")
        sys.exit(0)

    except urllib.error.HTTPError as e:
        sys.exit(1)
    except Exception as e:
        print(f"[ERRO GERAL] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
