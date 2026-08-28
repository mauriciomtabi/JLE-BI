// api/fetch-manutencao.js
// Serverless function on Vercel to fetch fresh Manutenção (OFS) data from Google Sheets

const SHEET_ID = '1fcei-KujFc4oA1DO9xIrATZiY-DeXfdaLFt7s_YIYQA';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

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
            row.push(currentCell.strip ? currentCell.strip() : currentCell.trim());
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
        lines.push(row);
    }
    return lines;
}

module.exports = async (req, res) => {
    // Set CORS headers
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
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Google Sheets export error: ${response.status}`);
        }

        const csvText = await response.text();
        const parsedRows = parseCsv(csvText);

        // Data rows start at index 2 (line 3)
        const dataRows = parsedRows.slice(2);

        const items = dataRows.map(r => {
            const getCol = (idx) => (r[idx] || '').trim();
            return {
                tipo_of: getCol(1) || '-',
                ral_rec: getCol(2) || '-',
                atividade: getCol(3) || '-',
                cabo: getCol(4) || '-',
                tipo_atividade: getCol(5) || '-',
                localidade: getCol(6) || '-',
                demanda: getCol(7) || '-',
                status: getCol(8) || '-',
                responsavel: getCol(9) || '-',
                endereco: getCol(10) || '-',
                data_acionamento: getCol(11) || '-',
                data_conclusao: getCol(12) || '-',
                equipe: getCol(13) || '-',
                tipo_defeito: getCol(14) || '-',
                causa_defeito: getCol(15) || '-',
                tipo_rede: getCol(16) || '-',
                servico_executado: getCol(17) || '-',
                observacao: getCol(18) || '-',
                precificado: getCol(31) || '-'
            };
        });

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

        res.status(200).json({
            success: true,
            generated_at: generated_at,
            count: items.length,
            rows: items
        });

    } catch (err) {
        console.error("Error in fetch-manutencao:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
