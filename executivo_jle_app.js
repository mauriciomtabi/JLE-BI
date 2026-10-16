/* Consolidado JLE: filtros compartilhados entre indicadores e lancamentos. */
(function () {
    'use strict';
    const el = id => document.getElementById('exec-jle-' + id);
    const money = v => v == null ? '—' : new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(v);
    const compact = v => v == null ? '' : new Intl.NumberFormat('pt-BR', {notation:'compact',maximumFractionDigits:1}).format(v);
    const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const monthLabel = p => new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(+p.slice(0,4),+p.slice(5)-1,1));
    const set = (id,v) => { if (el(id)) el(id).textContent = v; };
    const state = {month:null,uf:'',customer:'',start:'',end:'',search:'',kind:'',page:0,tab:'indicators',sort:'date',direction:-1};
    let chart, installed = false, timer, displayed = [];
    const source = () => window.EXECUTIVO_JLE_DATA;
    const sum = (rs,kind) => rs.filter(r=>r.kind===kind).reduce((s,r)=>s+Math.round(r.value*100),0)/100;
    function matches(r) {
        return (!state.uf || r.uf === state.uf) && (!state.customer || r.customer === state.customer)
            && (!state.start || r.date >= state.start) && (!state.end || r.date <= state.end)
            && (!state.search || norm([r.customer,r.description,r.category,r.bank,r.uf].join(' ')).includes(norm(state.search)));
    }
    function summarize(meta,records) {
        const rs=records.filter(r=>r.period===meta.period);
        const revenue=meta.revenue == null ? null : sum(rs,'revenue');
        // A base bancaria nao atribui despesas ao cliente do ERP.
        const expense=state.customer || meta.expense == null ? null : sum(rs,'expense');
        return {...meta,revenue,expense,result:revenue==null||expense==null?null:Math.round((revenue-expense)*100)/100,
            revenue_count:rs.filter(r=>r.kind==='revenue').length,expense_count:rs.filter(r=>r.kind==='expense').length};
    }
    function render() {
        const data=source();
        if (!data?.records) {set('notice','Atualize a página para carregar a nova base do consolidado.');return;}
        if (state.start && state.end && state.start>state.end) {set('notice','A data inicial deve ser anterior ou igual à data final.');return;}
        const periods=data.months.filter(m=>state.month==='ALL' ? m.comparable : m.period===state.month);
        const allowed=new Set(periods.map(m=>m.period));
        const filtered=data.records.filter(r=>allowed.has(r.period)&&matches(r));
        const monthly=periods.map(m=>summarize(m,filtered));
        const aggregate=field=>monthly.some(m=>m[field]==null)?null:monthly.reduce((s,m)=>s+Math.round(m[field]*100),0)/100;
        const revenue=aggregate('revenue'),expense=aggregate('expense'),result=aggregate('result');
        set('revenue',money(revenue));set('expense',money(expense));set('result',money(result));
        el('result').classList.toggle('exec-jle-negative',result!=null&&result<0);
        el('result').classList.toggle('exec-jle-positive',result!=null&&result>=0);
        const rc=filtered.filter(r=>r.kind==='revenue').length,ec=filtered.filter(r=>r.kind==='expense').length;
        set('revenue-note',revenue==null?'Faturamento indisponível':`${rc.toLocaleString('pt-BR')} notas · bruto faturado no ERP`);
        set('expense-note',state.customer?'Despesas sem vínculo com cliente':expense==null?'Despesas indisponíveis':`${ec.toLocaleString('pt-BR')} saídas · sem transferências`);
        set('result-note',state.customer?'Resultado por cliente indisponível':result==null?'Aguardando as duas fontes':`${revenue?(result/revenue*100).toFixed(1).replace('.',',')+'% da receita · ':''}${result>=0?'receita acima das despesas':'despesas acima da receita'}`);
        set('period-label',state.month==='ALL'?'Acumulado comparável':monthLabel(state.month));
        const notes=[];
        if (state.customer) notes.push('Cliente selecionado: somente faturamento. A fonte não vincula saídas bancárias ao cliente.');
        if (monthly.some(m=>m.revenue==null)) notes.push('Faturamento ainda não disponível neste período.');
        if (!filtered.length) notes.push('Nenhum lançamento encontrado para os filtros.');
        if (state.uf) notes.push('UF conforme registrada na origem; lançamentos sem UF ficam fora deste filtro.');
        if (state.month==='ALL' && data.months.some(m=>!m.comparable)) notes.push('Acumulado inclui apenas meses com receita e despesas disponíveis.');
        if (state.search) notes.push('Pesquisa aplicada ao cliente, nota e descrição das receitas e despesas.');
        set('notice',notes.join(' '));el('notice').hidden=!notes.length;
        renderMonthly(monthly);renderRecords(filtered);renderChart(filtered,monthly);
    }
    function renderMonthly(monthly) {
        const body=el('monthly-body');body.replaceChildren();
        for (const m of monthly) {
            const tr=document.createElement('tr');
            [m.period.slice(5)+'/'+m.period.slice(0,4),money(m.revenue),money(m.expense),money(m.result),state.customer?'Somente faturamento':m.result==null?'Fonte incompleta':'Fontes disponíveis'].forEach((v,i)=>{
                const td=document.createElement('td');td.textContent=v;
                if(i===0){const b=document.createElement('button');b.type='button';b.className='exec-jle-month-link';b.textContent=v;b.onclick=()=>{state.month=m.period;el('month').value=m.period;state.page=0;render();};td.replaceChildren(b);}
                if(i===3&&m.result!=null)td.className=m.result<0?'exec-jle-negative':'exec-jle-positive';tr.append(td);
            });body.append(tr);
        }
    }
    function renderRecords(records) {
        displayed=records.filter(r=>!state.kind||r.kind===state.kind).sort((a,b)=>state.direction*(state.sort==='value'?a.value-b.value:a.date.localeCompare(b.date)));
        const pages=Math.max(1,Math.ceil(displayed.length/50));state.page=Math.min(state.page,pages-1);
        const body=el('record-body');body.replaceChildren();
        for(const r of displayed.slice(state.page*50,(state.page+1)*50)){
            const tr=document.createElement('tr');
            [r.date.split('-').reverse().join('/'),r.kind==='revenue'?'Receita':'Despesa',r.customer?`${r.customer} · ${r.description}`:r.description,r.uf,[r.bank,r.category].filter(Boolean).join(' · '),money(r.value)].forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===5)td.className=r.kind==='revenue'?'exec-jle-positive':'exec-jle-pending';tr.append(td);});body.append(tr);
        }
        if(!displayed.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='Nenhum lançamento encontrado.';tr.append(td);body.append(tr);}
        set('record-count',`(${displayed.length.toLocaleString('pt-BR')})`);set('page',`${state.page+1} de ${pages}`);
        el('previous').disabled=state.page===0;el('next').disabled=state.page+1>=pages;
    }
    function renderChart(records,monthly) {
        if(chart){chart.destroy();chart=null;}if(typeof Chart==='undefined')return;
        const daily=state.month!=='ALL', buckets=[];
        if(daily){const days=new Date(+state.month.slice(0,4),+state.month.slice(5),0).getDate(),meta=monthly[0];
            for(let d=1;d<=days;d++){
                const date=state.month+'-'+String(d).padStart(2,'0');if(state.start&&date<state.start||state.end&&date>state.end)continue;
                // Competencia bancaria pode diferir do mes da data; separar esses lancamentos.
                const rs=records.filter(r=>r.date===date),rev=meta.revenue==null?null:sum(rs,'revenue'),exp=meta.expense==null?null:sum(rs,'expense');
                buckets.push({label:String(d).padStart(2,'0'),revenue:rev,expense:exp,result:rev==null||exp==null?null:Math.round((rev-exp)*100)/100});
            }
            const outside=records.filter(r=>!r.date.startsWith(state.month));
            if(outside.length){const rev=meta.revenue==null?null:sum(outside,'revenue'),exp=meta.expense==null?null:sum(outside,'expense');buckets.push({label:'Outras datas¹',revenue:rev,expense:exp,result:rev==null||exp==null?null:Math.round((rev-exp)*100)/100});}
        } else monthly.forEach(m=>buckets.push({...m,label:m.period.slice(5)+'/'+m.period.slice(0,4)}));
        set('chart-title',daily?`Evolução diária · ${monthLabel(state.month)}`:'Evolução mensal · acumulado comparável');
        set('chart-note',buckets.some(b=>b.label==='Outras datas¹')?'¹ Saídas da competência selecionada com data bancária em outro mês.':'');
        const css=getComputedStyle(document.body),color=css.getPropertyValue('--text-secondary').trim()||'#8a99a8',border=css.getPropertyValue('--border-color').trim()||'#20313f';
        const datasets=[['Receita bruta','revenue','#10b981'],['Despesas','expense','#f59e0b']].map(([label,k,c])=>({label,data:buckets.map(b=>b[k]),type:'bar',backgroundColor:c,borderColor:c,borderWidth:0,borderRadius:4}));
        chart=new Chart(el('chart'),{type:'bar',data:{labels:buckets.map(b=>b.label),datasets},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,right:16}},interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color,boxWidth:12,usePointStyle:true}},datalabels:{display:ctx=>ctx.dataset.data[ctx.dataIndex]!=null&&ctx.dataset.data[ctx.dataIndex]!==0,anchor:'end',align:ctx=>ctx.dataset.data[ctx.dataIndex]<0?'bottom':'top',offset:3,clip:false,color,font:{family:'Outfit',size:9,weight:'bold'},formatter:compact},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${money(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color,maxRotation:0,autoSkip:true}},y:{beginAtZero:true,grace:'20%',grid:{color:border},ticks:{color,callback:compact}}},onClick:(_,items)=>{if(!daily&&items.length){state.month=monthly[items[0].index].period;el('month').value=state.month;state.page=0;render();}}}});
    }
    function options(id,values,caption){const select=el(id);select.replaceChildren();for(const v of ['',...values]){const o=document.createElement('option');o.value=v;o.textContent=v==='N/D'?'Sem UF':v||caption;select.append(o);}select.value=state[id];}
    function reset(){Object.assign(state,{month:source().metadata.default_period,uf:'',customer:'',start:'',end:'',search:'',kind:'',page:0});for(const k of ['month','uf','customer','start','end','search','kind'])el(k).value=state[k];render();}
    function tab(name){state.tab=name;el('indicators').hidden=name!=='indicators';el('records').hidden=name!=='records';for(const k of ['indicators','records']){el('tab-'+k).classList.toggle('active',k===name);el('tab-'+k).setAttribute('aria-selected',String(k===name));}if(name==='indicators')render();}
    window.initExecutivoJle=function(){
        const data=source();if(!el('month')||!data?.months?.length)return;
        if(!state.month||!data.months.some(m=>m.period===state.month)&&state.month!=='ALL')state.month=data.metadata.default_period;
        const select=el('month');select.replaceChildren();for(const p of ['ALL',...data.months.map(m=>m.period)]){const opt=document.createElement('option');opt.value=p;opt.textContent=p==='ALL'?'Acumulado comparável':monthLabel(p)+(data.months.find(m=>m.period===p).comparable?'':' · fonte incompleta');select.append(opt);}select.value=state.month;
        options('uf',[...new Set((data.records||[]).map(r=>r.uf))].sort(),'Todas as UFs');options('customer',[...new Set((data.records||[]).map(r=>r.customer).filter(Boolean))].sort(),'Todos os clientes');
        if(!installed){installed=true;
            for(const k of ['month','uf','customer','start','end'])el(k).addEventListener('change',()=>{state[k]=el(k).value;state.page=0;render();});
            el('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.search=el('search').value.trim();state.page=0;render();},250);});
            el('kind').addEventListener('change',()=>{state.kind=el('kind').value;state.page=0;render();});
            el('clear').onclick=reset;el('latest').onclick=reset;el('previous').onclick=()=>{state.page--;render();};el('next').onclick=()=>{state.page++;render();};
            for(const name of ['indicators','records'])el('tab-'+name).onclick=()=>tab(name);
            document.querySelectorAll('#view-executivo-container [data-sort]').forEach(b=>b.onclick=()=>{state.direction=state.sort===b.dataset.sort?-state.direction:-1;state.sort=b.dataset.sort;state.page=0;render();});
            el('export').onclick=()=>{if(typeof XLSX==='undefined'){set('notice','Exportador indisponível. Recarregue a página.');el('notice').hidden=false;return;}const book=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(displayed.map(r=>({'Data':r.date,'Competência':r.period,'Tipo':r.kind==='revenue'?'Receita':'Despesa','Cliente':r.customer,'Descrição':r.description,'UF':r.uf,'Banco':r.bank,'Categoria':r.category,'Valor':r.value})));XLSX.utils.book_append_sheet(book,sheet,'Consolidado JLE');XLSX.writeFile(book,'Consolidado_JLE_'+state.month+'.xlsx');};
            new MutationObserver(()=>{if(window.activeView==='executivo')render();}).observe(document.body,{attributes:true,attributeFilter:['class']});
        }render();
    };
})();
