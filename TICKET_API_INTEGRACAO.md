# Abastecimento via API Ticket Log

Fonte: `POST https://srv1.ticketlog.com.br/ticketlog-servicos/ebs/transacaoVeiculo/search`.
Documentacao: https://www.goodmanager.com.br/documentacao-api-compra-ws/veiculo/public/index.html

`update_veiculos.ps1` consulta a API por padrao; `update_all.ps1` continua chamando esse mesmo script e publicando os dados pelo fluxo existente. A rotina consulta desde o inicio do mes anterior ate hoje. A Ticket limita cada requisicao a um dia. Datas incluem horario inicial/final e os parametros de cliente/produto sao enviados no corpo e na query por compatibilidade com o servico de producao. Nenhuma operacao de cadastro ou alteracao na Ticket e executada.

Credencial somente em `.env.local` (ignorado pelo Git): `TICKET_API_BASIC_AUTH`, contendo o header Basic fornecido pela Ticket. Cliente `TICKET_API_CLIENT_ID` e produto `TICKET_API_PRODUCT_CODE` tambem podem ser configurados. Nunca incluir credenciais no frontend, nesta documentacao ou em commits.

Execucao manual: `powershell -ExecutionPolicy Bypass -File .\update_veiculos.ps1`.
Conferencia sem gravacao: `python fetch_veiculos_ticket_api.py --start-date 2026-09-01 --end-date 2026-09-30 --dry-run`.
Contingencia manual por planilha: `powershell -ExecutionPolicy Bypass -File .\update_veiculos.ps1 -UseSpreadsheet`.

Todas as consultas terminam antes de substituir `veiculos_data.js`. Falhas, campos obrigatorios ausentes ou registros invalidos interrompem a importacao e preservam a base anterior. Um intervalo inteiramente vazio tambem exige conferencia manual. A substituicao respeita as datas completas, preservando outros dias e anos. A copia `veiculos_local.xlsx` recebe o historico consolidado. O Service Worker atual remove seu proprio cache; sua marca de versao e atualizada a cada importacao.

O contrato consumido pelo frontend permanece igual: date, plate, driver, value, uf, month, liters, vlLiter, model, fuel, fleet, km e kml. transactionId acrescenta o identificador de origem para evitar descartar transacoes distintas. HTML, estilos e calculos do painel permanecem intactos.

Conciliacao realizada em 15/10/2026: setembro retornou os mesmos 396 abastecimentos, R$ 111.552,44 e 17.281,46 litros da planilha, incluindo as mesmas quantidades por UF (SC 203, RS 141, PR 52), 68 veiculos e 60 motoristas. A importacao inicial incluiu setembro e outubro ate 15/10/2026 e preservou janeiro a agosto.
