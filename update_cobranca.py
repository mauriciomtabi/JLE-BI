import os
import sys
import json
import csv
import re
import zipfile
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

script_dir = os.path.dirname(os.path.abspath(__file__))
bi_dir = os.path.abspath(os.path.join(script_dir, "..")) if os.path.basename(script_dir) == "scratch" else script_dir

def parse_date_str(val):
    if not val:
        return ""
    val_str = str(val).strip()
    if not val_str:
        return ""
    # Check YYYY-MM-DD
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # Check DD/MM/YYYY
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})", val_str)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    # Check Excel OADate float
    try:
        f = float(val_str)
        import datetime as dt
        d = dt.datetime(1899, 12, 30) + dt.timedelta(days=f)
        return d.strftime("%Y-%m-%d")
    except:
        pass
    return val_str

def get_days_between(d1_str, d2_str):
    if not d1_str or not d2_str:
        return None
    try:
        d1 = datetime.strptime(d1_str[:10], "%Y-%m-%d")
        d2 = datetime.strptime(d2_str[:10], "%Y-%m-%d")
        return (d2 - d1).days
    except:
        return None

def detect_csv_encoding(file_path):
    with open(file_path, "rb") as f:
        sample = f.read(256 * 1024)
    # Check UTF-8 BOM
    if sample.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    # Try strict UTF-8
    try:
        sample.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass
    # Try CP1252 / Latin-1 / ISO-8859-1
    for enc in ["latin1", "cp1252", "iso-8859-1"]:
        try:
            sample.decode(enc)
            return enc
        except UnicodeDecodeError:
            pass
    return "latin1"

def clean_text(val):
    if val is None:
        return ""
    s = str(val).strip()
    # Normalize common encoding artifacts
    if "\ufffd" in s or "?" in s:
        s = re.sub(r"EM\s+EXECU[\ufffd?]+O", "EM EXECUÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"RECUPERA[\ufffd?]+O", "RECUPERAÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"CONSTRU[\ufffd?]+O", "CONSTRUÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"ATIVA[\ufffd?]+O", "ATIVAÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"DESATIVA[\ufffd?]+O", "DESATIVAÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"MEDI[\ufffd?]+O\s+CONCLU[\ufffd?]+DA", "MEDIÇÃO CONCLUÍDA", s, flags=re.IGNORECASE)
        s = re.sub(r"OR[\ufffd?]+AMENTO\s+APROVADO", "ORÇAMENTO APROVADO", s, flags=re.IGNORECASE)
        s = re.sub(r"LICENCIAMENTO\s+E\s+CONSTRU[\ufffd?]+O", "LICENCIAMENTO E CONSTRUÇÃO", s, flags=re.IGNORECASE)
        s = re.sub(r"RETORNADO\s+PARA\s+CORRE[\ufffd?]+O", "RETORNADO PARA CORREÇÃO", s, flags=re.IGNORECASE)
    return s

def normalize_fase_de_para(fase_val):
    s = clean_text(fase_val).upper().strip()
    if not s:
        return ""
    if "EM EXECU" in s or ("EXECU" in s and "EXECUTADO" not in s):
        return "EM EXECUÇÃO"
    if s == "EXECUTADO":
        return "EXECUTADO"
    if s == "APROVADO":
        return "APROVADO"
    if "PEDIDO" in s:
        return "PEDIDO EMITIDO"
    return s

def normalize_categoria(cat_val):
    s = clean_text(cat_val).upper().strip()
    if not s:
        return ""
    if "RECUPERA" in s and "REDE" in s:
        return "RECUPERAÇÃO REDE"
    if "PLANTA EXTERNA" in s:
        return "PLANTA EXTERNA"
    if "FIXO MENSAL" in s:
        return "FIXO MENSAL"
    if "CONSTRU" in s:
        return "CONSTRUÇÃO"
    if "DESATIVA" in s:
        return "DESATIVAÇÃO"
    if "ATIVA" in s:
        return "ATIVAÇÃO"
    return clean_text(cat_val).strip()

def process_cobranca(input_path=None):
    if not input_path:
        input_path = os.path.join(bi_dir, "local_cobranca_file.csv")
    
    print(f"Lendo base de cobrança: {input_path}")
    
    # Report date from argument or filename
    if len(sys.argv) > 2 and sys.argv[2].strip():
        report_date = sys.argv[2].strip()
    else:
        fname = os.path.basename(input_path)
        m = re.search(r"(\d{4})_(\d{2})_(\d{2})", fname)
        if m:
            report_date = f"{m.group(1)}-{m.group(2)}-{m.group(3)} 18:00:00"
        else:
            # Check .last_claro_mail_date
            mail_date_file = os.path.join(bi_dir, ".last_claro_mail_date")
            if os.path.exists(mail_date_file):
                with open(mail_date_file, "r") as mf:
                    md = mf.read().strip()
                    if len(md) == 8:
                        report_date = f"{md[:4]}-{md[4:6]}-{md[6:8]} 18:00:00"
                    else:
                        report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            else:
                report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
    print(f"Data do relatório: {report_date}")
    
    # Check if input is a real Excel zip file
    is_real_excel = False
    if input_path.lower().endswith(".xlsx") or input_path.lower().endswith(".xlsm"):
        try:
            with zipfile.ZipFile(input_path, "r") as zf:
                if "xl/workbook.xml" in zf.namelist():
                    is_real_excel = True
        except:
            is_real_excel = False
            
    # Lookups
    lookup_categorias = []
    map_categorias = {}
    lookup_cidades = []
    map_cidades = {}
    lookup_ufs = []
    map_ufs = {}
    lookup_projetos = []
    map_projetos = {}
    lookup_projetos_gerenciais = []
    map_projetos_gerenciais = {}
    lookup_tipos_atividade = []
    map_tipos_atividade = {}
    lookup_fase_atual = []
    map_fase_atual = {}
    lookup_contratos = []
    map_contratos = {}
    lookup_itens_descritivos = []
    map_itens_descritivos = {}
    lookup_tipos_despesa = []
    map_tipos_despesa = {}
    lookup_objetos_contrato = []
    map_objetos_contrato = {}
    lookup_users = []
    map_users = {}
    lookup_fase_de_para = []
    map_fase_de_para = {}
    
    def get_lookup_idx(val, lookup_list, map_dict):
        val_str = str(val or "").strip()
        if val_str in map_dict:
            return map_dict[val_str]
        idx = len(lookup_list)
        lookup_list.append(val_str)
        map_dict[val_str] = idx
        return idx
        
    rows_list = []
    count = 0

    if is_real_excel:
        print("Lendo como planilha Excel (.xlsx)...")
        import openpyxl
        wb = openpyxl.load_workbook(input_path, read_only=True, data_only=True)
        ws = wb.active
        
        row_iter = ws.iter_rows(values_only=True)
        header_row = next(row_iter, None)
        if not header_row:
            print("Planilha vazia!")
            return
            
        headers = {str(h).strip().upper(): idx for idx, h in enumerate(header_row) if h is not None}
        
        for row in row_iter:
            count += 1
            val_raw = row[headers["VALOR_TOTAL_FINAL"]] if "VALOR_TOTAL_FINAL" in headers and headers["VALOR_TOTAL_FINAL"] < len(row) else None
            if val_raw is None:
                continue
            val_str = str(val_raw).replace("R$", "").replace(" ", "").strip()
            if not val_str:
                continue
            if "," in val_str and "." in val_str:
                val_str = val_str.replace(".", "").replace(",", ".")
            elif "," in val_str:
                val_str = val_str.replace(",", ".")
            try:
                val_num = round(float(val_str), 2)
            except:
                continue
            if val_num == 0:
                continue
                
            def get_col(name):
                idx = headers.get(name)
                if idx is not None and idx < len(row):
                    return row[idx]
                return ""
                
            cat_val = normalize_categoria(get_col("CATEGORIA"))
            cat_idx = get_lookup_idx(cat_val, lookup_categorias, map_categorias)
            cidade_idx = get_lookup_idx(clean_text(get_col("CIDADE")), lookup_cidades, map_cidades)
            uf_idx = get_lookup_idx(clean_text(get_col("UF")), lookup_ufs, map_ufs)
            proj_idx = get_lookup_idx(clean_text(get_col("PROJETO")), lookup_projetos, map_projetos)
            proj_ger_idx = get_lookup_idx(clean_text(get_col("PROJETO_GERENCIAL")), lookup_projetos_gerenciais, map_projetos_gerenciais)
            tipo_ativ_idx = get_lookup_idx(clean_text(get_col("TIPO_DE_ATIVIDADE")), lookup_tipos_atividade, map_tipos_atividade)
            fase_idx = get_lookup_idx(clean_text(get_col("FASE_ATUAL")), lookup_fase_atual, map_fase_atual)
            contrato_idx = get_lookup_idx(clean_text(get_col("CONTRATO_NUMERO")), lookup_contratos, map_contratos)
            item_desc_idx = get_lookup_idx(clean_text(get_col("ITEM_DESCRITIVO")), lookup_itens_descritivos, map_itens_descritivos)
            tipo_desp_idx = get_lookup_idx(clean_text(get_col("TIPO_DE_DESPESA")), lookup_tipos_despesa, map_tipos_despesa)
            obj_contr_idx = get_lookup_idx(clean_text(get_col("OBJETO_DO_CONTRATO")), lookup_objetos_contrato, map_objetos_contrato)
            user_med_idx = get_lookup_idx(clean_text(get_col("USER_INCLUSAO_LPU")), lookup_users, map_users)
            user_ped_idx = get_lookup_idx(clean_text(get_col("USER_PEDIDO")), lookup_users, map_users)
            
            fase_de_para_str = normalize_fase_de_para(get_col("FASE_ATUAL_DE_PARA"))
            fase_de_para_idx = get_lookup_idx(fase_de_para_str, lookup_fase_de_para, map_fase_de_para)
            
            pep = clean_text(get_col("PEP"))
            os_val = clean_text(get_col("OS"))
            num_med = clean_text(get_col("NUMERO_MEDICAO"))
            num_ped = clean_text(get_col("NUMERO_PEDIDO"))
            
            dt_cad = parse_date_str(get_col("DATA_CADASTRO"))
            dt_aprov = parse_date_str(get_col("DATA_APROVACAO_MEDICAO"))
            dt_incl_lpu = parse_date_str(get_col("DATA_INCLUSAO_LPU"))
            tempo_aprov = get_days_between(dt_cad, dt_aprov)
            
            if fase_de_para_str in ["APROVADO", "PEDIDO EMITIDO"]:
                dt_ref = dt_aprov
            else:
                dt_ref = dt_incl_lpu
                
            mes_med = "PREVISTO"
            if dt_ref and re.match(r"^\d{4}-\d{2}-\d{2}", dt_ref):
                mes_med = f"{dt_ref[0:4]}/{dt_ref[5:7]}"
                
            row_array = [
                pep, cat_idx, os_val, cidade_idx, uf_idx, proj_idx, proj_ger_idx, tipo_ativ_idx,
                fase_idx, contrato_idx, item_desc_idx, tipo_desp_idx, obj_contr_idx, val_num,
                dt_cad, dt_aprov, tempo_aprov, user_med_idx, num_med, num_ped, user_ped_idx,
                fase_de_para_idx, mes_med, dt_incl_lpu
            ]
            rows_list.append(row_array)
    else:
        # Read as CSV with detected encoding
        enc = detect_csv_encoding(input_path)
        print(f"Lendo como CSV delimitado (Encoding detectado: {enc})...")
        
        with open(input_path, "r", encoding=enc, errors="replace") as f:
            first_line = f.readline()
            delimiter = ";" if ";" in first_line else ","
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delimiter)
            
            for row in reader:
                count += 1
                val_str = str(row.get("VALOR_TOTAL_FINAL", "")).replace("R$", "").replace(" ", "").strip()
                if not val_str:
                    continue
                if "," in val_str and "." in val_str:
                    val_str = val_str.replace(".", "").replace(",", ".")
                elif "," in val_str:
                    val_str = val_str.replace(",", ".")
                try:
                    val_num = round(float(val_str), 2)
                except:
                    continue
                    
                if val_num == 0:
                    continue
                    
                cat_val = normalize_categoria(row.get("CATEGORIA"))
                cat_idx = get_lookup_idx(cat_val, lookup_categorias, map_categorias)
                cidade_idx = get_lookup_idx(clean_text(row.get("CIDADE")), lookup_cidades, map_cidades)
                uf_idx = get_lookup_idx(clean_text(row.get("UF")), lookup_ufs, map_ufs)
                proj_idx = get_lookup_idx(clean_text(row.get("PROJETO")), lookup_projetos, map_projetos)
                proj_ger_idx = get_lookup_idx(clean_text(row.get("PROJETO_GERENCIAL")), lookup_projetos_gerenciais, map_projetos_gerenciais)
                tipo_ativ_idx = get_lookup_idx(clean_text(row.get("TIPO_DE_ATIVIDADE")), lookup_tipos_atividade, map_tipos_atividade)
                fase_idx = get_lookup_idx(clean_text(row.get("FASE_ATUAL")), lookup_fase_atual, map_fase_atual)
                contrato_idx = get_lookup_idx(clean_text(row.get("CONTRATO_NUMERO")), lookup_contratos, map_contratos)
                item_desc_idx = get_lookup_idx(clean_text(row.get("ITEM_DESCRITIVO")), lookup_itens_descritivos, map_itens_descritivos)
                tipo_desp_idx = get_lookup_idx(clean_text(row.get("TIPO_DE_DESPESA")), lookup_tipos_despesa, map_tipos_despesa)
                obj_contr_idx = get_lookup_idx(clean_text(row.get("OBJETO_DO_CONTRATO")), lookup_objetos_contrato, map_objetos_contrato)
                user_med_idx = get_lookup_idx(clean_text(row.get("USER_INCLUSAO_LPU")), lookup_users, map_users)
                user_ped_idx = get_lookup_idx(clean_text(row.get("USER_PEDIDO")), lookup_users, map_users)
                
                fase_de_para_str = normalize_fase_de_para(row.get("FASE_ATUAL_DE_PARA"))
                fase_de_para_idx = get_lookup_idx(fase_de_para_str, lookup_fase_de_para, map_fase_de_para)
                
                pep = clean_text(row.get("PEP"))
                os_val = clean_text(row.get("OS"))
                num_med = clean_text(row.get("NUMERO_MEDICAO"))
                num_ped = clean_text(row.get("NUMERO_PEDIDO"))
                
                dt_cad = parse_date_str(row.get("DATA_CADASTRO"))
                dt_aprov = parse_date_str(row.get("DATA_APROVACAO_MEDICAO"))
                dt_incl_lpu = parse_date_str(row.get("DATA_INCLUSAO_LPU"))
                tempo_aprov = get_days_between(dt_cad, dt_aprov)
                
                if fase_de_para_str in ["APROVADO", "PEDIDO EMITIDO"]:
                    dt_ref = dt_aprov
                else:
                    dt_ref = dt_incl_lpu
                    
                mes_med = "PREVISTO"
                if dt_ref and re.match(r"^\d{4}-\d{2}-\d{2}", dt_ref):
                    mes_med = f"{dt_ref[0:4]}/{dt_ref[5:7]}"
                    
                row_array = [
                    pep, cat_idx, os_val, cidade_idx, uf_idx, proj_idx, proj_ger_idx, tipo_ativ_idx,
                    fase_idx, contrato_idx, item_desc_idx, tipo_desp_idx, obj_contr_idx, val_num,
                    dt_cad, dt_aprov, tempo_aprov, user_med_idx, num_med, num_ped, user_ped_idx,
                    fase_de_para_idx, mes_med, dt_incl_lpu
                ]
                rows_list.append(row_array)
            
    print(f"Total lido: {count} linhas. Total válido compactado: {len(rows_list)} registros.")
    print("Lookups fase_de_para:", lookup_fase_de_para)
    print("Lookups categorias:", lookup_categorias)
    
    payload = {
        "generated_at": report_date,
        "lookups": {
            "categorias": lookup_categorias,
            "cidades": lookup_cidades,
            "ufs": lookup_ufs,
            "projetos": lookup_projetos,
            "projetos_gerenciais": lookup_projetos_gerenciais,
            "tipos_atividade": lookup_tipos_atividade,
            "fase_atual": lookup_fase_atual,
            "contratos": lookup_contratos,
            "itens_descritivos": lookup_itens_descritivos,
            "tipos_despesa": lookup_tipos_despesa,
            "objetos_contrato": lookup_objetos_contrato,
            "users": lookup_users,
            "fase_de_para": lookup_fase_de_para
        },
        "rows": rows_list
    }
    
    output_path = os.path.join(bi_dir, "cobranca_data.js")
    json_str = json.dumps(payload, ensure_ascii=False)
    
    js_content = f"""// Dados de Cobrança Compactados - Gerado em: {report_date}
(function() {{
    const db = {json_str};
    const l = db.lookups;
    
    // Descomprimir na memória
    window.COBRANCA_DATA = db.rows.map(r => ({{
        pep: r[0],
        categoria: l.categorias[r[1]],
        os: r[2],
        cidade: l.cidades[r[3]],
        uf: l.ufs[r[4]],
        projeto: l.projetos[r[5]],
        projeto_gerencial: l.projetos_gerenciais[r[6]],
        tipo_atividade: l.tipos_atividade[r[7]],
        fase_atual: l.fase_atual[r[8]],
        contrato_numero: l.contratos[r[9]],
        item_descritivo: l.itens_descritivos[r[10]],
        tipo_despesa: l.tipos_despesa[r[11]],
        objeto_do_contrato: l.objetos_contrato[r[12]],
        valor_total: r[13],
        data_cadastro: r[14],
        data_aprovacao: r[15],
        tempo_aprovacao: r[16],
        user_inclusao_medicao: l.users[r[17]],
        numero_medicao: r[18],
        numero_pedido: r[19],
        user_pedido: l.users[r[20]],
        fase_atual_de_para: l.fase_de_para[r[21]],
        mes_medicao: r[22],
        data_inclusao_lpu: r[23]
    }}));
    
    window.COBRANCA_METADATA = {{
        generated_at: db.generated_at,
        count: db.rows.length
    }};
    
    console.log('Base de Cobrança carregada:', window.COBRANCA_DATA.length, 'registros.');
}})();
"""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"Salvo {output_path} com sucesso.")
    
    # 4.5. cobranca_simple.json
    simple_map = {}
    for r in rows_list:
        os_val = r[2]
        if not os_val:
            continue
        os_key = str(os_val).strip().upper()
        if not os_key:
            continue
        status_val = lookup_fase_de_para[r[21]]
        ped_val = str(r[19] or "").strip()
        
        if os_key in simple_map:
            ex = simple_map[os_key]
            if ped_val and not ex["pedido"]:
                ex["pedido"] = ped_val
            if status_val and not ex["status"]:
                ex["status"] = status_val
        else:
            simple_map[os_key] = {
                "status": status_val,
                "pedido": ped_val
            }
            
    simple_payload = {
        "generated_at": report_date,
        "os": simple_map
    }
    simple_path = os.path.join(bi_dir, "cobranca_simple.json")
    with open(simple_path, "w", encoding="utf-8") as f:
        json.dump(simple_payload, f, ensure_ascii=False)
    print(f"Salvo {simple_path} com sucesso.")

if __name__ == "__main__":
    file_arg = sys.argv[1] if len(sys.argv) > 1 else None
    process_cobranca(file_arg)
