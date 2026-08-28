// api/fetch-sar.js
// Serverless function on Vercel to fetch fresh SAR data from Google Sheets in real-time

const SHEET_ID = '1kQyIsIDmsnunTbHU46n_3FmeL8ddbGGHnXHo6FXAfq4';
const GID = '1221770117';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

const MESES_PT = [
    "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
];

function normalizeHeader(str) {
    if (!str) return "";
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseCsv(csvText) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentCell = '';
    
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            row.push(currentCell.trim());
            if (row.length > 0 && row.some(cell => cell !== '')) {
                lines.push(row);
            }
            row = [];
            currentCell = '';
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else {
            currentCell += char;
        }
    }
    if (currentCell || row.length > 0) {
        row.push(currentCell.trim());
        if (row.some(cell => cell !== '')) {
            lines.push(row);
        }
    }
    return lines;
}

function parseDateIso(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s || s === '-' || s.toLowerCase() === 'none' || s.toLowerCase() === 'null') return null;
    
    const mBr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mBr) {
        return `${mBr[3]}-${String(mBr[2]).padStart(2, '0')}-${String(mBr[1]).padStart(2, '0')}`;
    }
    const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mIso) {
        return `${mIso[1]}-${String(mIso[2]).padStart(2, '0')}-${String(mIso[3]).padStart(2, '0')}`;
    }
    return null;
}

function formatDateBr(isoStr) {
    if (!isoStr || isoStr.length < 10) return '-';
    const parts = isoStr.substring(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoStr;
}

function toNumber(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

function countBusinessDays(d1Str, d2Str) {
    if (!d1Str || !d2Str) return 0;
    const start = new Date(d1Str + 'T00:00:00');
    const end = new Date(d2Str + 'T00:00:00');
    if (end < start) return 0;
    
    let count = 0;
    let cur = new Date(start);
    while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
            count++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(0, count - 1);
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const response = await fetch(CSV_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Falha ao baixar Google Sheets: HTTP ${response.status}`);
        }

        const csvText = await response.text();
        const rows = parseCsv(csvText);

        if (!rows || rows.length < 2) {
            throw new Error('Planilha Google Sheets vazia ou ilegível.');
        }

        // Mapeamento dinâmico de cabeçalho
        const headerRow = rows[0];
        const colMap = {};
        headerRow.forEach((h, idx) => {
            const nh = normalizeHeader(h);
            if (nh) colMap[nh] = idx;
        });

        function getColIdx(aliases, defaultIdx) {
            for (const a of aliases) {
                const na = normalizeHeader(a);
                for (const hKey in colMap) {
                    if (hKey.includes(na) || na.includes(hKey)) {
                        return colMap[hKey];
                    }
                }
            }
            return defaultIdx;
        }

        const idxCod = getColIdx(['CODIGO SAR', 'CODIGO', 'COD'], 0);
        const idxArea = getColIdx(['AREA TECNICA', 'AREA'], 1);
        const idxNode = getColIdx(['NODE', 'NO'], 2);
        const idxSite = getColIdx(['SITE', 'LOCAL'], 3);
        const idxCidade = getColIdx(['CIDADE', 'MUNICIPIO'], 4);
        const idxCondominio = getColIdx(['CONDOMINIO', 'PREDIO'], 5);
        const idxEndereco = getColIdx(['ENDERECO', 'LOGRADOURO'], 6);
        const idxCaixaMdu = getColIdx(['CAIXA MDU', 'CX MDU'], 7);
        const idxServico = getColIdx(['SERVICO', 'ESCOPO'], 8);
        const idxClasseL = getColIdx(['CLASSE L', 'EXECUTOR L'], 9);
        const idxClasseF = getColIdx(['CLASSE F', 'EXECUTOR F'], 10);
        const idxProjetado = getColIdx(['PROJETADO'], 11);
        const idxExecutado = getColIdx(['EXECUTADO'], 12);
        const idxEntrada = getColIdx(['DATA ENTRADA', 'ENTRADA'], 13);
        const idxEntrega = getColIdx(['DATA ENTREGA', 'ENTREGA'], 14);
        const idxRelatorioPpt = getColIdx(['RELATORIO PPT', 'RELATORIO'], 15);
        const idxDataEnvioMed = getColIdx(['DATA ENVIO MEDICAO', 'ENVIO MEDICAO'], 16);
        const idxTempo = getColIdx(['TEMPO DIAS', 'TEMPO'], 17);
        const idxPrazo = getColIdx(['PRAZO SLA', 'PRAZO'], 18);
        const idxAtraso = getColIdx(['ATRASO DIAS', 'ATRASO'], 19);
        const idxStatus = getColIdx(['STATUS GERAL SAR', 'STATUS GERAL', 'STATUS'], 21);

        // Medição e WF (Douglas)
        const idxDataMedicao = getColIdx(['DATA MEDICAO', 'DATA MEDIÇÃO'], 34);
        const idxValorMedicao = getColIdx(['VALOR MEDICAO', 'VALOR'], 35);
        const idxWf = getColIdx(['N WF', 'NO WF', 'NUM WF', 'WORKFLOW'], 36);
        const idxDataPedido = getColIdx(['DATA PEDIDO'], 37);
        const idxPedido = getColIdx(['N DO PEDIDO', 'NO DO PEDIDO', 'PEDIDO'], 38);
        const idxObs = getColIdx(['OBSERVACOES', 'OBSERVAÇÕES'], 39);

        const records = [];
        const todayStr = new Date().toISOString().substring(0, 10);

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 2) continue;

            const cod = (r[idxCod] || '').trim();
            const cidade = (r[idxCidade] || '').trim();

            // Filtrar linhas de rascunho sem cidade
            if (!cod || !cidade) continue;

            const area_tecnica = (r[idxArea] || '').trim();
            const node = (r[idxNode] || '').trim();
            const site = (r[idxSite] || '').trim();
            const condominio = (r[idxCondominio] || '').trim();
            const endereco = (r[idxEndereco] || '').trim();
            const caixa_mdu = (r[idxCaixaMdu] || '').trim();
            const servico = (r[idxServico] || '').trim();
            const classe_l = (r[idxClasseL] || '').trim();
            const classe_f = (r[idxClasseF] || '').trim();
            const projetado = (r[idxProjetado] || '').trim();
            const executado = (r[idxExecutado] || '').trim();

            const dt_entrada_iso = parseDateIso(r[idxEntrada]);
            const dt_entrega_iso = parseDateIso(r[idxEntrega]);
            const relatorio_ppt = (r[idxRelatorioPpt] || '').trim();
            const data_envio_med = (r[idxDataEnvioMed] || '').trim();

            let tempo_dias = toNumber(r[idxTempo]);
            let prazo_raw = (r[idxPrazo] || '').trim().toUpperCase();
            let atraso_dias = toNumber(r[idxAtraso]);

            // Status Geral SAR (Coluna 21 ou mapeada dinamicamente)
            const status_geral_raw = (r[idxStatus] || '').trim();
            const status = status_geral_raw || "EM ANDAMENTO";

            // Douglas (Campos de Faturamento)
            const dt_medicao_iso = parseDateIso(r[idxDataMedicao]);
            const valor_medicao = toNumber(r[idxValorMedicao]);
            const num_wf = (r[idxWf] || '').trim();
            const dt_pedido_iso = parseDateIso(r[idxDataPedido]);
            const num_pedido = (r[idxPedido] || '').trim();
            const observacoes = (r[idxObs] || '').trim();
            const status_wf = status === 'WF IMPLANTADO' || status === 'Pedido Implantado' || status === 'WF Aprovado' ? '100% - OK' : '';

            // Cálculo do tempo em dias úteis caso zerado
            if (tempo_dias <= 0 && dt_entrada_iso) {
                const targetDate = dt_medicao_iso || dt_entrega_iso || (!status.includes('CONCLU') && !status.includes('CANCEL') ? todayStr : null);
                if (targetDate) {
                    tempo_dias = countBusinessDays(dt_entrada_iso, targetDate);
                }
            }

            let prazo = 'NO PRAZO';
            if (prazo_raw.includes('NO PRAZO') || prazo_raw.includes('DENTRO')) {
                prazo = 'NO PRAZO';
            } else if (prazo_raw.includes('ATRASAD') || prazo_raw.includes('FORA')) {
                prazo = 'ATRASADO';
            } else {
                prazo = tempo_dias > 3 ? 'ATRASADO' : 'NO PRAZO';
            }

            if (prazo === 'ATRASADO' && atraso_dias <= 0 && tempo_dias > 3) {
                atraso_dias = tempo_dias - 3;
            } else if (prazo === 'NO PRAZO') {
                atraso_dias = 0;
            }

            const ano_entrada = dt_entrada_iso ? dt_entrada_iso.substring(0, 4) : 'NÃO INFORMADO';
            const mes_num = dt_entrada_iso && dt_entrada_iso.length >= 7 ? dt_entrada_iso.substring(5, 7) : '';
            const mes_idx = parseInt(mes_num, 10);
            const mes_nome = (mes_idx >= 1 && mes_idx <= 12) ? MESES_PT[mes_idx] : 'NÃO INFORMADO';
            const competencia = (ano_entrada !== 'NÃO INFORMADO' && mes_nome !== 'NÃO INFORMADO') ? `${mes_nome}/${ano_entrada}` : 'NÃO INFORMADO';

            records.push({
                cod,
                area_tecnica,
                node,
                site,
                cidade,
                condominio,
                endereco,
                caixa_mdu,
                classe_l,
                classe_f,
                situacao: projetado,
                relatorio_foto: executado,
                servico,
                data_entrada: dt_entrada_iso,
                data_entrada_fmt: formatDateBr(dt_entrada_iso),
                data_entrega: dt_entrega_iso,
                data_entrega_fmt: formatDateBr(dt_entrega_iso),
                data_medicao: dt_medicao_iso,
                data_medicao_fmt: formatDateBr(dt_medicao_iso),
                num_wf,
                status_wf,
                num_pedido,
                data_pedido: dt_pedido_iso,
                data_pedido_fmt: formatDateBr(dt_pedido_iso),
                valor_medicao,
                competencia,
                ano: ano_entrada,
                mes: mes_nome,
                mes_num,
                status,
                status_relatorio: relatorio_ppt,
                status_medicao: data_envio_med,
                status_obra: (status.includes('IMPLANTADO') || status.includes('CONCLU') || status.includes('APROV')) ? 'Concluído Campo' : 'Em Andamento',
                prazo,
                tempo_dias,
                atraso_dias
            });
        }

        const cidades = [...new Set(records.map(r => r.cidade).filter(Boolean))].sort();
        const areas = [...new Set(records.map(r => r.area_tecnica).filter(Boolean))].sort();
        const status_list = [...new Set(records.map(r => r.status).filter(Boolean))].sort();
        const competencias = [...new Set(records.map(r => r.competencia).filter(c => c && c !== 'NÃO INFORMADO'))].sort();
        const anos = [...new Set(records.map(r => r.ano).filter(a => a && a !== 'NÃO INFORMADO'))].sort().reverse();
        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        const now = new Date();
        const brFormatter = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = brFormatter.formatToParts(now);
        const pMap = {};
        parts.forEach(p => pMap[p.type] = p.value);
        const generated_at = `${pMap.year}-${pMap.month}-${pMap.day} ${pMap.hour}:${pMap.minute}:${pMap.second}`;

        const metadata = {
            total_records: records.length,
            generated_at,
            source_file: `Google Sheets (${SHEET_ID})`,
            cidades,
            areas_tecnicas: areas,
            status_list,
            prazos: ['NO PRAZO', 'ATRASADO'],
            competencias,
            anos,
            meses
        };

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            metadata,
            data: records
        });
    } catch (err) {
        console.error('Erro em api/fetch-sar:', err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
};
