---
name: bi-etl-automation
description: >-
  Guia definitivo e regras operacionais para todos os pipelines de ETL e sincronização
  de dados do BI JLE Telecom (Financeiro JLE, Tecnodrill, Analítico Claro, Veículos, Manutenção e MDU).
  Ative esta skill sempre que for criar, modificar, depurar ou executar rotinas de atualização de dados.
---

# BI JLE Telecom - ETL & Data Pipeline Automation Guide

Este documento estabelece as diretrizes obrigatórias para manipulação, extração, transformação e carregamento (ETL) de todas as fontes de dados do ecossistema BI JLE Telecom.

---

## 1. Mapeamento das Fontes e Destinos de Dados

| Módulo | Script ETL | Fonte Principal | Cache Local | Destino JS |
| :--- | :--- | :--- | :--- | :--- |
| **Financeiro JLE** | `update_dashboard.ps1` | `\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO\` | `local_file.xlsx` | `data.js` (`window.CASH_FLOW_DATA`) |
| **Financeiro Tecnodrill** | `update_tecnodrill.ps1` | `\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\FLUXO CAIXA\` | `tecnodrill_local.xlsx` | `tecnodrill_data.js` (`window.TECNODRILL_DATA`) |
| **Analítico Claro** | `update_cobranca.ps1` | `\\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALÍTICO CLARO\` | `local_cobranca_file.xlsx` | `cobranca_data.js` (`window.COBRANCA_DATA`) |
| **Veículos (Abastecimento)** | `update_veiculos.ps1` | `\\10.121.21.252\administrativo\09. TICKET RELATORIOS\` | `veiculos_local.xlsx` | `veiculos_data.js` (`window.VEICULOS_DATA`) |
| **Manutenção** | `update_manutencao.ps1` | Google Sheets (CSV export gid=0) | `manutencao_data.csv` | `manutencao_data.js` (`window.MANUTENCAO_DATA`) |
| **MDU** | `update_mdu.ps1` | Google Sheets (CSV export gid=260790893) | `mdu_data.csv` | `mdu_data.js` (`window.MDU_DATA`) |
| **Orquestrador Mestre** | `update_all.ps1` | Executa todos os 6 módulos acima em sequência e sincroniza git/PWA | - | Todos os arquivos `*_data.js` |

---

## 2. Regras Críticas de Desenvolvimento em PowerShell & Excel COM

### 2.1. Busca Resiliente na Rede (Multi-Directory Fallback)
As pastas do servidor compartilhado podem sofrer reorganização ou renomeação por equipes internas.
- **Sempre defina um array de `$candidateDirs`** contendo os diretórios primários, alternativos e subpastas conhecidas.
- **Filtre arquivos temporários do Office**: ignore explicitamente arquivos que começam com `~$` (`$_.Name -notlike "~$*"`).
- **Ordene por data real de modificação**: selecione o arquivo com maior `LastWriteTime` ou data no nome do arquivo.
- **Sincronize o cache local**: sempre que um arquivo mais recente for baixado da rede com sucesso, atualize a cópia local de fallback (`Copy-Item -Path $net -Destination $fallback -Force`).

### 2.2. Gestão do Processo Excel COM
- Sempre execute o COM Object dentro de um bloco `try / finally`.
- No bloco `finally`, certifique-se de:
  ```powershell
  if ($null -ne $workbook) { $workbook.Close($false) }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  ```
- Configure `$excel.DisplayAlerts = $false` e `$excel.Visible = $false` para evitar prompts interativos que bloqueiam a automação.

### 2.3. Conversão Numérica e Parsing de Moeda (pt-BR)
Valores monetários e numéricos lidos via COM podem vir como `[double]`, `[decimal]` ou `[string]`.
- Se for tipo numérico nativo, converta diretamente via `[double]$val`.
- Se for `string`, trate formatações com separador de milhar e decimal:
  ```powershell
  # Exemplo: 1.234,56 -> 1234.56
  $valStr = $valStr -replace "\.", "" -replace ",", "."
  ```
- Sempre arredonde valores finais para 2 casas decimais: `[Math]::Round($valor, 2)`.

### 2.4. Tratamento de Nomes de Abas e Meses (Competência)
- Suporte variações ortográficas nos nomes de abas (ex: `AGO`, `AGOS`, `AGOSTO`, `MAI _2026`).
- Padronize o formato de competência gerado para `MÊS/ANO` (ex: `AGOSTO/2026`), com caixa alta e sem espaços extras.

---

## 3. Agendamento de Tarefas no Windows

A automação local é gerenciada pelo Agendador de Tarefas do Windows:
- Tarefa: `JLE_Telecom_BI_Update`
- Disparadores: Segunda a Sexta-feira às 10:00 e 15:00.
- Ação: `powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "update_all.ps1"`
- Script de reconfiguração: `configurar_agendamento.ps1` / `configurar_agendamento.bat`.
