import os
import sys
import json
import subprocess
import zipfile
import shutil
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

script_dir = os.path.dirname(os.path.abspath(__file__))
log_file = os.path.join(script_dir, "monitor_claro.log")
temp_dir = os.path.join(script_dir, "temp_email_extract")
cache_csv = os.path.join(script_dir, "local_cobranca_file.csv")
last_mail_file = os.path.join(script_dir, ".last_claro_mail_date")
etl_script = os.path.join(script_dir, "update_cobranca.py")

def write_log(msg):
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    line = f"[{now_str}] {msg}"
    print(line)
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def run_git_sync(report_date):
    git_exe = r"C:\Program Files\Git\cmd\git.exe"
    if not os.path.exists(git_exe):
        git_exe = "git"
    
    try:
        write_log("Verificando status do Git para publicação...")
        st = subprocess.run([git_exe, "status", "--porcelain", "cobranca_data.js", "cobranca_simple.json"],
                            cwd=script_dir, capture_output=True, text=True)
        if st.stdout.strip():
            write_log("Novos dados de cobrança detectados. Enviando para o GitHub...")
            subprocess.run([git_exe, "add", "cobranca_data.js", "cobranca_simple.json", ".last_claro_mail_date"],
                           cwd=script_dir, check=True)
            commit_msg = f"data(claro): atualizacao automatica analitico claro ({report_date})"
            subprocess.run([git_exe, "commit", "-m", commit_msg],
                           cwd=script_dir, check=True)
            subprocess.run([git_exe, "pull", "--rebase", "origin", "main"],
                           cwd=script_dir, check=False)
            push_res = subprocess.run([git_exe, "push", "origin", "main"],
                                      cwd=script_dir, capture_output=True, text=True)
            if push_res.returncode == 0:
                write_log("Deploy automático disparado com sucesso via GitHub (Vercel)!")
            else:
                write_log(f"Aviso no git push: {push_res.stderr.strip()}")
        else:
            write_log("Nenhuma alteração pendente no repositório Git.")
    except Exception as e:
        write_log(f"Erro na sincronização Git: {e}")

def trigger_webhook():
    try:
        import urllib.request
        webhook_url = "https://jle-monitoramento-tecnico.vercel.app/api/sync-bi"
        headers = {
            "Authorization": "Bearer jle-bi-sync-token-2026",
            "Content-Type": "application/json"
        }
        req = urllib.request.Request(webhook_url, data=b"{}", headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            write_log(f"Sincronização em produção disparada: {resp.status}")
    except Exception as e:
        write_log(f"Aviso no webhook Servicos JLE: {e}")

def main():
    force = "--force" in sys.argv or "-Force" in sys.argv
    write_log("==========================================================")
    write_log("JLE TELECOM - MONITOR E-MAIL CLARO (v4 Python COM)")
    write_log("==========================================================")

    # 1. Conectar ao Outlook via win32com
    try:
        import win32com.client
    except ImportError:
        write_log("ERRO: Módulo pywin32 não instalado no ambiente Python.")
        return 1

    outlook = None
    try:
        # Tentar conectar a instância existente ou iniciar
        outlook = win32com.client.Dispatch("Outlook.Application")
        ns = outlook.GetNamespace("MAPI")
        write_log("Conexão ao Outlook estabelecida com sucesso.")
    except Exception as e:
        write_log(f"ERRO ao conectar ao Outlook COM: {e}")
        return 1

    # 2. Forçar sincronização (Send/Receive)
    try:
        write_log("Forçando sincronização do Outlook (Send/Receive)...")
        ns.SendAndReceive(False)
    except Exception as e:
        write_log(f"Aviso no Send/Receive: {e}")

    # 3. Varrer todas as pastas procurando o e-mail mais recente com Analitico_Empreiteiras e anexo ZIP
    write_log("Iniciando busca em todas as contas e pastas do Outlook...")
    most_recent_mail = None
    most_recent_folder = ""

    def scan_folder(folder, depth=0):
        nonlocal most_recent_mail, most_recent_folder
        try:
            items = folder.Items
            for item in items:
                try:
                    if hasattr(item, "Subject") and "Analitico_Empreiteiras" in str(item.Subject):
                        has_zip = False
                        if hasattr(item, "Attachments"):
                            for att in item.Attachments:
                                if att.FileName.lower().endswith(".zip"):
                                    has_zip = True
                                    break
                        if has_zip:
                            recv = getattr(item, "ReceivedTime", None)
                            if recv:
                                if most_recent_mail is None or recv > most_recent_mail.ReceivedTime:
                                    most_recent_mail = item
                                    most_recent_folder = folder.Name
                except Exception:
                    pass
        except Exception:
            pass

        if depth < 10:
            try:
                for sub in folder.Folders:
                    scan_folder(sub, depth + 1)
            except Exception:
                pass

    try:
        for store in ns.Folders:
            scan_folder(store, 0)
    except Exception as e:
        write_log(f"Erro ao varrer pastas do Outlook: {e}")

    if not most_recent_mail:
        write_log("AVISO: Nenhum e-mail da Claro com anexo ZIP encontrado no Outlook.")
        return 0

    subject = str(most_recent_mail.Subject)
    received_time = str(most_recent_mail.ReceivedTime)
    write_log("E-mail mais recente encontrado!")
    write_log(f"  Assunto : {subject}")
    write_log(f"  Pasta   : {most_recent_folder}")
    write_log(f"  Recebido: {received_time}")

    # Extrair data no assunto (ex: 2026_08_31 -> 20260831)
    import re
    m = re.search(r"(\d{4})_(\d{2})_(\d{2})", subject)
    subject_date = f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else ""
    report_formatted = f"{m.group(1)}-{m.group(2)}-{m.group(3)} 18:00:00" if m else datetime.now().strftime("%Y-%m-%d 18:00:00")

    # Anti-duplicidade
    if not force and os.path.exists(last_mail_file) and subject_date:
        try:
            with open(last_mail_file, "r", encoding="utf-8") as f:
                last_saved = f.read().strip()
            if last_saved >= subject_date:
                write_log(f"Relatório de {subject_date} já foi processado anteriormente (último: {last_saved}). Nenhuma ação necessária.")
                return 0
        except Exception:
            pass

    # 4. Baixar anexo ZIP
    zip_att = None
    for att in most_recent_mail.Attachments:
        if att.FileName.lower().endswith(".zip"):
            zip_att = att
            break

    if not zip_att:
        write_log("ERRO: Anexo ZIP não encontrado na mensagem.")
        return 1

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)

    zip_path = os.path.join(temp_dir, zip_att.FileName)
    write_log(f"Salvando anexo ZIP em: {zip_path}")
    zip_att.SaveAsFile(zip_path)

    # 5. Extrair ZIP
    write_log("Extraindo arquivo ZIP...")
    extracted_file_path = None
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(temp_dir)
        for fname in zf.namelist():
            fpath = os.path.join(temp_dir, fname)
            if (fname.endswith(".csv") or fname.endswith(".xlsx")) and not fname.startswith("~$"):
                extracted_file_path = fpath
                size_mb = os.path.getsize(fpath) / (1024 * 1024)
                write_log(f"Arquivo extraído: {fname} ({size_mb:.2f} MB)")
                break

    if not extracted_file_path:
        write_log("ERRO: Nenhum arquivo CSV/XLSX válido encontrado dentro do ZIP.")
        return 1

    # Atualizar cache local
    try:
        shutil.copyfile(extracted_file_path, cache_csv)
        write_log(f"Cache local atualizado: {cache_csv}")
    except Exception as e:
        write_log(f"Aviso ao copiar para cache local: {e}")

    # 6. Executar ETL Python
    write_log(f"Executando ETL Python (update_cobranca.py) com data: {report_formatted}...")
    etl_res = subprocess.run([sys.executable, etl_script, extracted_file_path, report_formatted],
                             cwd=script_dir, capture_output=True, text=True, encoding="utf-8")
    
    if etl_res.returncode == 0:
        write_log("ETL concluído com sucesso!")
        # Salvar data processada
        if subject_date:
            with open(last_mail_file, "w", encoding="utf-8") as f:
                f.write(subject_date)
            write_log(f"Data registrada no controle: {subject_date}")

        # 7. Sincronizar com GitHub e disparar Webhook
        run_git_sync(report_formatted)
        trigger_webhook()
    else:
        write_log(f"ERRO no ETL Python: {etl_res.stderr.strip() or etl_res.stdout.strip()}")
        return 1

    # 8. Limpeza de temporários
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
        write_log("Arquivos temporários removidos.")

    write_log("Monitoramento e atualização concluídos com sucesso!")
    write_log("==========================================================")
    return 0

if __name__ == "__main__":
    sys.exit(main())
