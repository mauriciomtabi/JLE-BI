// api/fetch-sar.js
// Serverless function on Vercel to fetch fresh SAR data from Google Sheets in real-time

const SHEET_ID = '1kQyIsIDmsnunTbHU46n_3FmeL8ddbGGHnXHo6FXAfq4';
const GID = '1221770117';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

const MESES_PT = [
    "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
];

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

        const records = [];
        const todayStr = new Date().toISOString().substring(0, 10);

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 2) continue;

            const cod = (r[0] || '').trim();
            const cidade = (r[4] || '').trim();

            // Filtrar linhas sem cidade
            if (!cod || !cidade) continue;

            const area_tecnica = (r[1] || '').trim();
            const node = (r[2] || '').trim();
            const site = (r[3] || '').trim();
            const condominio = (r[5] || '').trim();
            const endereco = (r[6] || '').trim();
            const caixa_mdu = (r[7] || '').trim();
            const servico = (r[8] || '').trim();
            const classe_l = (r[9] || '').trim();
            const classe_f = (r[10] || '').trim();
            const projetado = (r[11] || '').trim();
            const executado = (r[12] || '').trim();
            const observacao_op = (r[13] || '').trim();

            const dt_entrada_iso = parseDateIso(r[14]);
            const dt_inicio_iso = parseDateIso(r[15]);
            const dt_previsao_iso = parseDateIso(r[16]);
            const dt_entrega_iso = parseDateIso(r[17]);
            const relatorio_ppt = (r[18] || '').trim();
            const data_envio_med = (r[19] || '').trim();

            let tempo_dias = toNumber(r[20]);
            let prazo_raw = (r[21] || '').trim().toUpperCase();
            let atraso_dias = toNumber(r[22]);

            // Status Geral (Coluna X / idx 23) - Exatamente o da planilha
            const status_geral_raw = (r[23] || '').trim();
            const status = status_geral_raw || "EM ANDAMENTO";

            // Douglas (Colunas Y, Z, AA, AB, AC)
            const dt_medicao_iso = parseDateIso(r[24]);
            const valor_medicao = toNumber(r[25]);
            const num_wf = (r[26] || '').trim();
            const num_pedido = (r[27] || '').trim();
            const observacoes = (r[28] || '').trim();
            const status_wf = status === 'WF IMPLANTADO' ? '100% - OK' : '';

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
                situacao: observacao_op || projetado,
                relatorio_foto: executado,
                servico,
                data_entrada: dt_entrada_iso,
                data_entrada_fmt: formatDateBr(dt_entrada_iso),
                data_inicio: dt_inicio_iso,
                data_inicio_fmt: formatDateBr(dt_inicio_iso),
                data_previsao: dt_previsao_iso,
                data_previsao_fmt: formatDateBr(dt_previsao_iso),
                data_entrega: dt_entrega_iso,
                data_entrega_fmt: formatDateBr(dt_entrega_iso),
                data_medicao: dt_medicao_iso,
                data_medicao_fmt: formatDateBr(dt_medicao_iso),
                num_wf,
                status_wf,
                competencia,
                ano: ano_entrada,
                mes: mes_nome,
                mes_num,
                status,
                status_relatorio: relatorio_ppt,
                status_medicao: data_envio_med,
                status_obra: status === 'WF IMPLANTADO' ? 'Concluído Campo' : 'Em Andamento',
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
        const generated_at = now.toISOString().replace('T', ' ').substring(0, 19);

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
