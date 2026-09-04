// api/fetch-sar.js
// Serverless function on Vercel to fetch fresh SAR data from Google Sheets in real-time

const SHEET_ID = '1kQyIsIDmsnunTbHU46n_3FmeL8ddbGGHnXHo6FXAfq4';
const GID = '1221770117';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

const MESES_PT = [
    "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
];

const LPU_PRECOS = {
    q_211: 1.20,
    q_212: 1.00,
    q_215: 1.45,
    q_113: 0.75,
    q_311: 65.00,
    q_317: 50.00,
    q_318: 60.00,
    q_315: 80.00,
    q_313: 9.00,
    q_314: 3.50,
    q_312: 15.00
};

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
    let s = String(val).replace(/R\$/g, '').replace(/\xa0/g, '').trim();
    if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    const clean = s.replace(/[^0-9.-]/g, '');
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

        if (!rows || rows.length < 3) {
            throw new Error('Planilha Google Sheets vazia ou ilegível.');
        }

        // Localizar dinamicamente a linha de cabeçalho
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const rowStr = rows[i].map(normalizeHeader).join(' ');
            if (rowStr.includes('COD') && rowStr.includes('CIDADE') && (rowStr.includes('ENDERE') || rowStr.includes('AREA'))) {
                headerRowIdx = i;
                break;
            }
        }
        if (headerRowIdx === -1) {
            headerRowIdx = 2; // fallback padrão
        }

        const headerRow = rows[headerRowIdx];
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

        // LPU
        const idx211 = getColIdx(['2 11 CB AS', '2 11', 'CB AS'], 22);
        const idx212 = getColIdx(['2 12 CB SUB', '2 12', 'CB SUB'], 23);
        const idx215 = getColIdx(['2 15 CB ESP', '2 15', 'CB ESP'], 24);
        const idx113 = getColIdx(['1 13 CORD', '1 13', 'CORD'], 25);
        const idx311 = getColIdx(['3 11 CX EM', '3 11', 'CX EM'], 26);
        const idx317 = getColIdx(['3 17 DIO', '3 17', 'DIO'], 27);
        const idx318 = getColIdx(['3 18 NAP', '3 18', 'NAP'], 28);
        const idx315 = getColIdx(['3 15 AB FE', '3 15', 'AB FE'], 29);
        const idx313 = getColIdx(['3 13 FUS', '3 13', 'FUS'], 30);
        const idx314 = getColIdx(['3 14 OTDR', '3 14', 'OTDR'], 31);
        const idx312 = getColIdx(['3 12 DER', '3 12', 'DER'], 32);

        // Totais e Medição
        const idxTotalTerc = getColIdx(['TOTAL TERCEIROS', 'TOTAL TERCEIRO'], 33);
        const idxPreviaMed = getColIdx(['PREVIA MEDICAO', 'PREVIA MEDIÇÃO'], 34);
        const idxDataMedicao = getColIdx(['DATA MEDICAO', 'DATA MEDIÇÃO'], 35);
        const idxValorMedicao = getColIdx(['VALOR MEDICAO', 'VALOR'], 36);
        const idxWf = getColIdx(['N WF', 'NO WF', 'NUM WF', 'WORKFLOW'], 37);
        const idxDataPedido = getColIdx(['DATA PEDIDO'], 38);
        const idxPedido = getColIdx(['N DO PEDIDO', 'NO DO PEDIDO', 'PEDIDO'], 39);
        const idxObs = getColIdx(['OBSERVACOES', 'OBSERVAÇÕES'], 40);

        const records = [];
        const todayStr = new Date().toISOString().substring(0, 10);

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 2) continue;

            const cod = (r[idxCod] || '').trim();
            const cidade = (r[idxCidade] || '').trim();

            // Descartar rascunhos ou linhas sem código e cidade
            if (!cod || !cidade || !cod.startsWith('RS')) continue;

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

            const status_geral_raw = (r[idxStatus] || '').trim();
            const status = status_geral_raw || "EM ANDAMENTO";

            const dt_medicao_iso = parseDateIso(r[idxDataMedicao]);
            const valor_medicao = toNumber(r[idxValorMedicao]);
            const num_wf = (r[idxWf] || '').trim().replace('.0', '');
            const dt_pedido_iso = parseDateIso(r[idxDataPedido]);
            const num_pedido = (r[idxPedido] || '').trim().replace('.0', '');
            const observacoes = (r[idxObs] || '').trim();
            const status_wf = status.includes('IMPLANTADO') || status.includes('APROV') ? '100% - OK' : '';

            // Competência da Data de Medição
            const ano_medicao = dt_medicao_iso ? dt_medicao_iso.substring(0, 4) : 'SEM DATA';
            const mes_num_medicao = dt_medicao_iso && dt_medicao_iso.length >= 7 ? dt_medicao_iso.substring(5, 7) : '';
            const mes_idx_medicao = parseInt(mes_num_medicao, 10);
            const mes_nome_medicao = (mes_idx_medicao >= 1 && mes_idx_medicao <= 12) ? MESES_PT[mes_idx_medicao] : 'SEM DATA';
            const competencia_medicao = (dt_medicao_iso && ano_medicao !== 'SEM DATA' && mes_nome_medicao !== 'SEM DATA') ? `${mes_nome_medicao}/${ano_medicao}` : 'Sem Data';

            // Status Canônico para Medição
            const stClean = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            let status_medicao_grupo = 'OUTROS';
            if (stClean.includes('MEDI') && stClean.includes('ENVIAD')) {
                status_medicao_grupo = 'MEDIÇÃO ENVIADA';
            } else if (stClean.includes('FINALIZ')) {
                status_medicao_grupo = 'FINALIZADO';
            } else if (stClean.includes('PEDIDO') && stClean.includes('EMIT')) {
                status_medicao_grupo = 'PEDIDO EMITIDO';
            }
            const tem_medicao = valor_medicao > 0;

            // Quantidades LPU
            const q_211 = toNumber(r[idx211]);
            const q_212 = toNumber(r[idx212]);
            const q_215 = toNumber(r[idx215]);
            const q_113 = toNumber(r[idx113]);
            const q_311 = toNumber(r[idx311]);
            const q_317 = toNumber(r[idx317]);
            const q_318 = toNumber(r[idx318]);
            const q_315 = toNumber(r[idx315]);
            const q_313 = toNumber(r[idx313]);
            const q_314 = toNumber(r[idx314]);
            const q_312 = toNumber(r[idx312]);

            let total_terceiros = toNumber(r[idxTotalTerc]);
            let previa_medicao = toNumber(r[idxPreviaMed]);

            const calc_l = (q_211 * 1.20) + (q_212 * 1.00) + (q_215 * 1.45) + (q_113 * 0.75);
            const calc_f = (q_311 * 65.00) + (q_317 * 50.00) + (q_318 * 60.00) + (q_315 * 80.00) + (q_313 * 9.00) + (q_314 * 3.50) + (q_312 * 15.00);

            let val_l = 0.0;
            let val_f = 0.0;
            if (total_terceiros > 0) {
                if (classe_l && classe_f) {
                    if (calc_l > 0 && calc_f > 0) {
                        val_l = Math.round((total_terceiros * (calc_l / (calc_l + calc_f))) * 100) / 100;
                        val_f = Math.round((total_terceiros - val_l) * 100) / 100;
                    } else if (calc_l > 0) {
                        val_l = Math.min(total_terceiros, Math.round(calc_l * 100) / 100);
                        val_f = Math.round((total_terceiros - val_l) * 100) / 100;
                    } else if (calc_f > 0) {
                        val_f = Math.min(total_terceiros, Math.round(calc_f * 100) / 100);
                        val_l = Math.round((total_terceiros - val_f) * 100) / 100;
                    } else {
                        val_l = Math.round((total_terceiros / 2.0) * 100) / 100;
                        val_f = Math.round((total_terceiros - val_l) * 100) / 100;
                    }
                } else if (classe_l && !classe_f) {
                    val_l = total_terceiros;
                } else if (classe_f && !classe_l) {
                    val_f = total_terceiros;
                } else {
                    val_f = total_terceiros;
                }
            } else {
                val_l = Math.round(calc_l * 100) / 100;
                val_f = Math.round(calc_f * 100) / 100;
                total_terceiros = Math.round((val_l + val_f) * 100) / 100;
            }

            const itens_l_resumo = [];
            if (q_211 > 0) itens_l_resumo.push(`2.11 CB AS: ${q_211}m`);
            if (q_212 > 0) itens_l_resumo.push(`2.12 CB SUB: ${q_212}m`);
            if (q_215 > 0) itens_l_resumo.push(`2.15 CB ESP: ${q_215}m`);
            if (q_113 > 0) itens_l_resumo.push(`1.13 CORD: ${q_113}m`);

            const itens_f_resumo = [];
            if (q_311 > 0) itens_f_resumo.push(`3.11 CX EM: ${q_311} un`);
            if (q_317 > 0) itens_f_resumo.push(`3.17 DIO/DGO: ${q_317} un`);
            if (q_318 > 0) itens_f_resumo.push(`3.18 NAP/CTO: ${q_318} un`);
            if (q_315 > 0) itens_f_resumo.push(`3.15 AB/FE: ${q_315} un`);
            if (q_313 > 0) itens_f_resumo.push(`3.13 FUS/EME: ${q_313} un`);
            if (q_314 > 0) itens_f_resumo.push(`3.14 OTDR: ${q_314} un`);
            if (q_312 > 0) itens_f_resumo.push(`3.12 DER/INS: ${q_312} un`);

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

            const ano_entrega = dt_entrega_iso ? dt_entrega_iso.substring(0, 4) : 'NÃO INFORMADO';
            const mes_num_entrega = dt_entrega_iso && dt_entrega_iso.length >= 7 ? dt_entrega_iso.substring(5, 7) : '';
            const mes_idx_entrega = parseInt(mes_num_entrega, 10);
            const mes_nome_entrega = (mes_idx_entrega >= 1 && mes_idx_entrega <= 12) ? MESES_PT[mes_idx_entrega] : 'NÃO INFORMADO';
            const competencia_entrega = (ano_entrega !== 'NÃO INFORMADO' && mes_nome_entrega !== 'NÃO INFORMADO') ? `${mes_nome_entrega}/${ano_entrega}` : 'NÃO INFORMADO';

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
                competencia_medicao,
                ano_medicao,
                mes_medicao: mes_nome_medicao,
                mes_num_medicao,
                status_medicao_grupo,
                tem_medicao,
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
                competencia_entrega,
                ano_entrega,
                mes_entrega: mes_nome_entrega,
                mes_num_entrega,
                status,
                status_relatorio: relatorio_ppt,
                status_medicao: data_envio_med,
                status_obra: (status.includes('IMPLANTADO') || status.includes('CONCLU') || status.includes('APROV')) ? 'Concluído Campo' : 'Em Andamento',
                prazo,
                tempo_dias,
                atraso_dias,
                total_terceiros,
                previa_medicao,
                valor_classe_l: val_l,
                valor_classe_f: val_f,
                itens_l_resumo: itens_l_resumo.length > 0 ? itens_l_resumo.join(', ') : '-',
                itens_f_resumo: itens_f_resumo.length > 0 ? itens_f_resumo.join(', ') : '-',
                lpu_itens: {
                    q_211, q_212, q_215, q_113,
                    q_311, q_317, q_318, q_315,
                    q_313, q_314, q_312
                }
            });
        }

        const cidades = [...new Set(records.map(r => r.cidade).filter(Boolean))].sort();
        const areas = [...new Set(records.map(r => r.area_tecnica).filter(Boolean))].sort();
        const status_list = [...new Set(records.map(r => r.status).filter(Boolean))].sort();
        const competencias = [...new Set(records.map(r => r.competencia).filter(c => c && c !== 'NÃO INFORMADO'))].sort();
        const anos = [...new Set(records.map(r => r.ano).filter(a => a && a !== 'NÃO INFORMADO'))].sort().reverse();
        const competencias_entrega = [...new Set(records.map(r => r.competencia_entrega).filter(c => c && c !== 'NÃO INFORMADO'))].sort();
        const anos_entrega = [...new Set(records.map(r => r.ano_entrega).filter(a => a && a !== 'NÃO INFORMADO'))].sort().reverse();

        // Competências e Anos de Medição
        const compsMedValidas = [...new Set(records.filter(r => r.valor_medicao > 0 && r.competencia_medicao && r.competencia_medicao !== 'Sem Data' && r.competencia_medicao !== 'SEM DATA').map(r => r.competencia_medicao))];
        compsMedValidas.sort((a, b) => {
            const pA = a.split('/');
            const pB = b.split('/');
            const yA = parseInt(pA[1], 10) || 0;
            const yB = parseInt(pB[1], 10) || 0;
            if (yA !== yB) return yB - yA;
            const mA = MESES_PT.indexOf(pA[0]) || 0;
            const mB = MESES_PT.indexOf(pB[0]) || 0;
            return mB - mA;
        });
        if (records.some(r => r.valor_medicao > 0 && (!r.competencia_medicao || r.competencia_medicao === 'Sem Data' || r.competencia_medicao === 'SEM DATA'))) {
            compsMedValidas.push('Sem Data');
        }
        const anos_medicao = [...new Set(records.filter(r => r.valor_medicao > 0 && r.ano_medicao && r.ano_medicao !== 'SEM DATA').map(r => r.ano_medicao))].sort().reverse();

        // Totais e Qtds de Medição
        const recMedAlvo = records.filter(r => r.valor_medicao > 0 && ['MEDIÇÃO ENVIADA', 'FINALIZADO', 'PEDIDO EMITIDO'].includes(r.status_medicao_grupo));
        const tot_med_geral = Math.round(recMedAlvo.reduce((acc, r) => acc + (r.valor_medicao || 0), 0) * 100) / 100;
        const tot_med_enviada = Math.round(recMedAlvo.filter(r => r.status_medicao_grupo === 'MEDIÇÃO ENVIADA').reduce((acc, r) => acc + (r.valor_medicao || 0), 0) * 100) / 100;
        const tot_med_finalizado = Math.round(recMedAlvo.filter(r => r.status_medicao_grupo === 'FINALIZADO').reduce((acc, r) => acc + (r.valor_medicao || 0), 0) * 100) / 100;
        const tot_med_pedido = Math.round(recMedAlvo.filter(r => r.status_medicao_grupo === 'PEDIDO EMITIDO').reduce((acc, r) => acc + (r.valor_medicao || 0), 0) * 100) / 100;

        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        const tot_geral_terceiros = Math.round(records.reduce((acc, r) => acc + (r.total_terceiros || 0), 0) * 100) / 100;
        const tot_geral_previa = Math.round(records.reduce((acc, r) => acc + (r.previa_medicao || 0), 0) * 100) / 100;
        const tot_geral_medicao = Math.round(records.reduce((acc, r) => acc + (r.valor_medicao || 0), 0) * 100) / 100;
        const tot_geral_l = Math.round(records.reduce((acc, r) => acc + (r.valor_classe_l || 0), 0) * 100) / 100;
        const tot_geral_f = Math.round(records.reduce((acc, r) => acc + (r.valor_classe_f || 0), 0) * 100) / 100;

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
            competencias_entrega,
            anos_entrega,
            competencias_medicao: compsMedValidas,
            anos_medicao,
            meses,
            medicao: {
                total_geral: tot_med_geral,
                qtd_geral: recMedAlvo.length,
                total_medicao_enviada: tot_med_enviada,
                qtd_medicao_enviada: recMedAlvo.filter(r => r.status_medicao_grupo === 'MEDIÇÃO ENVIADA').length,
                total_finalizado: tot_med_finalizado,
                qtd_finalizado: recMedAlvo.filter(r => r.status_medicao_grupo === 'FINALIZADO').length,
                total_pedido_emitido: tot_med_pedido,
                qtd_pedido_emitido: recMedAlvo.filter(r => r.status_medicao_grupo === 'PEDIDO EMITIDO').length
            },
            financeiro: {
                total_terceiros: tot_geral_terceiros,
                total_previa_medicao: tot_geral_previa,
                total_medicao_claro: tot_geral_medicao,
                total_classe_l: tot_geral_l,
                total_classe_f: tot_geral_f
            }
        };

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            metadata,
            data: records
        });

    } catch (err) {
        console.error("Erro em /api/fetch-sar:", err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
};
