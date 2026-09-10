import os
import sys
import json
import subprocess
import zipfile
import shutil
import re
import email
from email.header import decode_header
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
sw_script = os.path.join(script_dir, "sw.js")

NETWORK_DIRS = [
    r"\\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALÍTICO CLARO",
    r"\\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALITICO CLARO"
]

def write_log(msg):
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    line = f"[{now_str}] {msg}"
    print(line)
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def bump_pwa_cache():
    if not os.path.exists(sw_script):
        return
    try:
        with open(sw_script, "r", encoding="utf-8") as f:
            content = f.read()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated = re.sub(r"// Versao:.*", f"// Versao: {now_str}", content)
        with open(sw_script, "w", encoding="utf-8") as f:
            f.write(updated)
        write_log(f"Cache do PWA atualizado em sw.js ({now_str}).")
    except Exception as e:
        write_log(f"Aviso ao atualizar sw.js: {e}")

def run_git_sync(report_date):
    git_exe = r"C:\Program Files\Git\cmd\git.exe"
    if not os.path.exists(git_exe):
        git_exe = "git"
    
    try:
        write_log("Verificando status do Git para publicação...")
        st = subprocess.run([git_exe, "status", "--porcelain", "cobranca_data.js", "cobranca_simple.json", ".last_claro_mail_date", "sw.js"],
                            cwd=script_dir, capture_output=True, text=True)
        if st.stdout.strip():
            write_log("Novos dados de cobrança detectados. Enviando para o GitHub...")
            subprocess.run([git_exe, "add", "cobranca_data.js", "cobranca_simple.json", ".last_claro_mail_date", "sw.js"],
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

def copy_to_network(file_path):
    fname = os.path.basename(file_path)
    for ndir in NETWORK_DIRS:
        if os.path.exists(ndir):
            try:
                dest = os.path.join(ndir, fname)
                shutil.copyfile(file_path, dest)
                write_log(f"Cópia de segurança enviada para a rede: {dest}")
                break
            except Exception as e:
                write_log(f"Aviso ao copiar para rede ({ndir}): {e}")

def get_zimbra_credentials():
    user = os.environ.get("ZIMBRA_USER", "mauricio.maciel@jletelecom.com.br")
    password = os.environ.get("ZIMBRA_PASS", "")
    host = os.environ.get("ZIMBRA_HOST", "imap.emailzimbraonline.com")
    
    if password:
        return host, user, password
        
    try:
        import winreg
        import win32crypt
        base_key = r"Software\Microsoft\Office\16.0\Outlook\Profiles\Outlook\9375CFF0413111d3B88A00104B2A6676"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, base_key) as k:
            for i in range(20):
                try:
                    subkey_name = winreg.EnumKey(k, i)
                    with winreg.OpenKey(k, subkey_name) as sk:
                        try:
                            acc_email, _ = winreg.QueryValueEx(sk, "Email")
                            if "jletelecom" in str(acc_email).lower():
                                pw_bytes, _ = winreg.QueryValueEx(sk, "IMAP Password")
                                try:
                                    dec = win32crypt.CryptUnprotectData(pw_bytes[1:], None, None, None, 0)[1]
                                except Exception:
                                    dec = win32crypt.CryptUnprotectData(pw_bytes, None, None, None, 0)[1]
                                password = dec.decode("utf-16-le").rstrip("\x00")
                                try:
                                    h, _ = winreg.QueryValueEx(sk, "IMAP Server")
                                    if h: host = h
                                except Exception:
                                    pass
                                return host, str(acc_email), password
                        except Exception:
                            continue
                except OSError:
                    break
    except Exception as e:
        write_log(f"Nota na leitura de credenciais Zimbra: {e}")
        
    return host, user, password

def fetch_via_zimbra_imap(force=False):
    import imaplib
    
    host, user, password = get_zimbra_credentials()
    if not password:
        write_log("Credenciais IMAP não disponíveis, passando para fallback...")
        return None
        
    write_log(f"Conectando diretamente ao Zimbra IMAP ({host}:993)...")
    try:
        mail = imaplib.IMAP4_SSL(host, 993)
        mail.login(user, password)
        write_log("Autenticação IMAP realizada com sucesso.")
    except Exception as e:
        write_log(f"Falha na conexão IMAP Zimbra: {e}")
        return None
        
    def decode_mime(header_val):
        if not header_val:
            return ""
        parts = decode_header(header_val)
        res = []
        for p, enc in parts:
            if isinstance(p, bytes):
                res.append(p.decode(enc or "utf-8", errors="ignore"))
            else:
                res.append(str(p))
        return "".join(res)
        
    found_candidates = []
    folders_to_check = ['INBOX', 'INBOX/BI JLE', 'INBOX/Claro']
    
    for fld in folders_to_check:
        try:
            res, _ = mail.select(f'"{fld}"', readonly=True)
            if res != 'OK':
                continue
            res, data = mail.search(None, 'ALL')
            if res != 'OK' or not data or not data[0]:
                continue
            ids = data[0].split()
            # Checa os ultimos 30 emails de cada pasta
            for msg_id in ids[-30:]:
                try:
                    res, msg_data = mail.fetch(msg_id, '(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE FROM)])')
                    raw_h = msg_data[0][1].decode('utf-8', errors='ignore')
                    parsed_h = email.message_from_string(raw_h)
                    subj = decode_mime(parsed_h.get('Subject', ''))
                    date_val = parsed_h.get('Date', '')
                    if "Analitico_Empreiteiras" in subj:
                        found_candidates.append((fld, msg_id, subj, date_val))
                except Exception:
                    pass
        except Exception as e:
            write_log(f"Aviso ao varrer pasta IMAP {fld}: {e}")
            
    if not found_candidates:
        mail.logout()
        write_log("Nenhum e-mail Analitico_Empreiteiras encontrado via IMAP.")
        return None
        
    # Pega o candidato com a data mais recente
    best_candidate = None
    best_dt = ""
    for fld, msg_id, subj, date_val in found_candidates:
        m = re.search(r"(\d{4})_(\d{2})_(\d{2})", subj)
        s_date = f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else ""
        if best_candidate is None or s_date > best_dt:
            best_candidate = (fld, msg_id, subj, date_val)
            best_dt = s_date

    best_fld, best_id, best_subj, best_date = best_candidate
    write_log(f"E-mail mais recente encontrado via IMAP:")
    write_log(f"  Pasta   : {best_fld}")
    write_log(f"  Assunto : {best_subj}")
    write_log(f"  Data    : {best_date}")
    
    m = re.search(r"(\d{4})_(\d{2})_(\d{2})", best_subj)
    subject_date = f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else ""
    report_formatted = f"{m.group(1)}-{m.group(2)}-{m.group(3)} 18:00:00" if m else datetime.now().strftime("%Y-%m-%d 18:00:00")
    
    if not force and os.path.exists(last_mail_file) and subject_date:
        try:
            with open(last_mail_file, "r", encoding="utf-8") as f:
                last_saved = f.read().strip()
            if last_saved >= subject_date:
                write_log(f"Relatório de {subject_date} já foi processado anteriormente (último: {last_saved}). Nenhuma ação necessária.")
                mail.logout()
                return "ALREADY_PROCESSED"
        except Exception:
            pass

    # Baixar anexo ZIP
    mail.select(f'"{best_fld}"', readonly=True)
    res, msg_data = mail.fetch(best_id, '(RFC822)')
    raw_email = msg_data[0][1]
    msg = email.message_from_bytes(raw_email)
    
    zip_path = None
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)
    
    for part in msg.walk():
        fn = part.get_filename()
        if fn and fn.lower().endswith('.zip'):
            zip_path = os.path.join(temp_dir, fn)
            with open(zip_path, 'wb') as f:
                f.write(part.get_payload(decode=True))
            write_log(f"Anexo ZIP baixado com sucesso: {zip_path}")
            break
            
    mail.logout()
    
    if not zip_path or not os.path.exists(zip_path):
        write_log("ERRO: Mensagem não continha o anexo ZIP esperado.")
        return None
        
    return {
        "zip_path": zip_path,
        "subject_date": subject_date,
        "report_formatted": report_formatted
    }

def fetch_via_outlook_com(force=False):
    try:
        import win32com.client
    except ImportError:
        write_log("pywin32 não instalado para fallback Outlook COM.")
        return None
        
    write_log("Tentando conexão via Outlook COM...")
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        ns = outlook.GetNamespace("MAPI")
    except Exception as e:
        write_log(f"Outlook COM indisponível: {e}")
        return None
        
    try:
        ns.SendAndReceive(False)
    except Exception:
        pass
        
    most_recent_mail = None
    most_recent_folder = ""
    
    def scan_folder(folder, depth=0):
        nonlocal most_recent_mail, most_recent_folder
        try:
            for item in folder.Items:
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
                            if recv and (most_recent_mail is None or recv > most_recent_mail.ReceivedTime):
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
        write_log(f"Erro ao varrer Outlook COM: {e}")

    if not most_recent_mail:
        return None
        
    subject = str(most_recent_mail.Subject)
    received_time = str(most_recent_mail.ReceivedTime)
    write_log(f"E-mail encontrado via Outlook COM: {subject} ({received_time})")
    
    m = re.search(r"(\d{4})_(\d{2})_(\d{2})", subject)
    subject_date = f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else ""
    report_formatted = f"{m.group(1)}-{m.group(2)}-{m.group(3)} 18:00:00" if m else datetime.now().strftime("%Y-%m-%d 18:00:00")
    
    if not force and os.path.exists(last_mail_file) and subject_date:
        try:
            with open(last_mail_file, "r", encoding="utf-8") as f:
                last_saved = f.read().strip()
            if last_saved >= subject_date:
                write_log(f"Relatório de {subject_date} já foi processado anteriormente (último: {last_saved}).")
                return "ALREADY_PROCESSED"
        except Exception:
            pass

    zip_att = None
    for att in most_recent_mail.Attachments:
        if att.FileName.lower().endswith(".zip"):
            zip_att = att
            break

    if not zip_att:
        return None

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)

    zip_path = os.path.join(temp_dir, zip_att.FileName)
    zip_att.SaveAsFile(zip_path)
    return {
        "zip_path": zip_path,
        "subject_date": subject_date,
        "report_formatted": report_formatted
    }

def main():
    force = "--force" in sys.argv or "-Force" in sys.argv
    write_log("==========================================================")
    write_log("JLE TELECOM - MONITOR E-MAIL CLARO (v5 Dual Engine: IMAP + COM)")
    write_log("==========================================================")

    # 1. Tentar obter via Zimbra IMAP direto
    email_data = fetch_via_zimbra_imap(force=force)
    
    # 2. Se IMAP não retornou dados, tentar Outlook COM
    if not email_data:
        email_data = fetch_via_outlook_com(force=force)

    if email_data == "ALREADY_PROCESSED":
        return 0

    if not email_data or not isinstance(email_data, dict):
        write_log("Nenhum novo anexo da Claro para processar.")
        return 0

    zip_path = email_data["zip_path"]
    subject_date = email_data["subject_date"]
    report_formatted = email_data["report_formatted"]

    # 3. Extrair ZIP
    write_log(f"Extraindo arquivo ZIP: {zip_path}")
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

    # 4. Atualizar cache local
    try:
        shutil.copyfile(extracted_file_path, cache_csv)
        write_log(f"Cache local atualizado: {cache_csv}")
    except Exception as e:
        write_log(f"Aviso ao copiar para cache local: {e}")

    # 5. Sincronizar com pasta de rede (se acessível)
    copy_to_network(extracted_file_path)

    # 6. Executar ETL Python
    write_log(f"Executando ETL Python (update_cobranca.py) com data: {report_formatted}...")
    etl_res = subprocess.run([sys.executable, etl_script, extracted_file_path, report_formatted],
                             cwd=script_dir, capture_output=True, text=True, encoding="utf-8")

    if etl_res.returncode == 0:
        write_log("ETL concluído com sucesso!")
        if subject_date:
            with open(last_mail_file, "w", encoding="utf-8") as f:
                f.write(subject_date)
            write_log(f"Data registrada no controle: {subject_date}")

        # Atualizar cache PWA
        bump_pwa_cache()

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
