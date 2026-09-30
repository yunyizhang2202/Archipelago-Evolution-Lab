(function(){
  'use strict';
  const E=globalThis.EvoLab,V=globalThis.EvoView,$=id=>document.getElementById(id),format=V.fmt;
  let world=E.createWorld(),activeTab='live',island=0,selected=null,stale=false,hits=[],running=false,pairRunning=false,timer=null;
  let experiment='migration',pair=E.createPair(experiment,$('pairSeed').value),replicates=[],batchBusy=false,batchCancelled=false,toastTimer;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function icons(){globalThis.lucide?.createIcons();}
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function download(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  function activate(tab){
    stop();activeTab=tab;
    document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    ['live','experiment','model'].forEach(key=>$(key+'Panel').hidden=key!==tab);
    requestAnimationFrame(()=>{if(tab==='live')render();else if(tab==='experiment')renderPair();});
  }
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>activate(button.dataset.tab));
    button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...document.querySelectorAll('[data-tab]')],idx=tabs.indexOf(button),next=e.key==='Home'?0:e.key==='End'?2:(idx+(e.key==='ArrowRight'?1:2))%3;activate(tabs[next].dataset.tab);tabs[next].focus();}});
  });
  function syncControls(){
    const c=world.config;$('mutation').value=c.mutation*100;$('migration').value=c.migration*100;$('selection').value=c.selection;$('capacity').value=c.capacity;
    $('mutationOut').textContent=(c.mutation*100).toFixed(2)+'%';$('migrationOut').textContent=Math.round(c.migration*100)+'%';$('selectionOut').textContent=c.selection.toFixed(2);$('capacityOut').textContent=c.capacity;
    $('islandSelect').value=island;const env=c.environments[island];$('colorOpt').value=env[0];$('heatOpt').value=env[1];$('colorOptOut').textContent=env[0].toFixed(2);$('heatOptOut').textContent=env[1].toFixed(2);
    document.querySelectorAll('[data-edge]').forEach(b=>b.setAttribute('aria-pressed',String(c.edges[+b.dataset.edge])));
    $('toggleAll').textContent=c.edges.some(Boolean)?'全部切断':'全部恢复';
  }
  function renderIndividual(){
    const found=selected?world.islands.flat().find(i=>i.id===selected):null;
    if(!found&&selected){selected=null;stale=true;}
    V.specimen($('specimen'),found);
    if(!found){$('individualDetail').innerHTML=`<p class="empty-title">${stale?'亲代已退出当前世代':'选择一个个体'}</p><p>${stale?'离散世代模型中，上一代由后代替代。选择一个新个体继续观察。':'点击岛屿上的标记，观察它的基因型与环境匹配。'}</p>`;return;}
    const t=E.traits(found.g),env=world.config.environments[found.island],w=E.fitness(found.g,env,world.config);
    const effects=t.map((value,j)=>Math.exp(-world.config.selection*(value-env[j])**2/(2*world.config.width**2)));
    const genes=offset=>Array.from({length:12},(_,j)=>`<i class="gene ${((found.g>>>(j+offset))&1)?'on':''}"></i>`).join('');
    $('individualDetail').innerHTML=`<div class="ind-id">#${found.id} · ${E.ISLANDS[found.island]}</div><div class="trait-row"><span>体色</span><b>${format(t[0],3)}</b></div><div class="trait-meter"><span style="width:${t[0]*100}%"></span></div><div class="genome-row" aria-label="体色的12个位点">${genes(0)}</div><div class="trait-row"><span>耐热性</span><b>${format(t[1],3)}</b></div><div class="trait-meter heat"><span style="width:${t[1]*100}%"></span></div><div class="genome-row heat" aria-label="耐热性的12个位点">${genes(12)}</div><div class="trait-row"><span>生殖权重 w</span><b>${format(w)}</b></div><p class="ind-note">环境最适：体色 ${format(env[0],2)} / 耐热 ${format(env[1],2)}<br>体色因子 ${format(effects[0])} × 耐热因子 ${format(effects[1])} = w<br>出生岛：${E.ISLANDS[found.birthIsland]}<br>${found.parent?'亲代 #'+found.parent:'祖先队列个体'} · ${found.mutations} 个位点突变<br>w 是相对最适个体的生殖权重，不是存活概率。</p>`;
  }
  function eventDescription(event){
    const a=event.action;
    if(a.type==='environment')return `${E.ISLANDS[a.island]}环境最适值设为 ${a.values.map(x=>x.toFixed(2)).join(' / ')}`;
    if(a.type==='bottleneck')return `${E.ISLANDS[a.island]}随机保留至多 ${a.survivors} 个个体`;
    if(a.type==='edges')return '迁移连接：'+a.values.map((v,i)=>['01–02','02–03','01–03'][i]+(v?' 连通':' 切断')).join('；');
    return Object.keys(a).filter(k=>k!=='type').map(k=>({mutation:'每位点突变率',migration:'迁移概率',selection:'选择强度',capacity:'中性承载量'}[k])+': '+a[k]).join('，');
  }
  function renderEvents(){
    $('eventCount').textContent=world.events.length+' 次干预';
    $('events').innerHTML='<li>第 0 代：三个岛屿由同一祖先群体建立。</li>'+world.events.slice(-100).map(e=>`<li>第 ${e.at} 代：${escape(eventDescription(e))}</li>`).join('');
  }
  function render(){
    if(activeTab!=='live')return;
    const m=E.metrics(world);$('generation').textContent=String(world.generation).padStart(3,'0');$('population').textContent=m.total;$('divergence').textContent=format(m.divergence);$('diversity').textContent=format(m.diversity);
    $('migrationCount').textContent='本代迁移 '+world.lastMigration.length;
    hits=V.drawWorld($('world'),world,{island,selected});renderIndividual();
    $('islandLedger').innerHTML=m.islands.map((s,i)=>`<div class="ledger-item" data-island="${i}"><div class="ledger-title"><span style="color:${V.colors[i]}"><span class="island-number">${i+1}</span>${E.ISLANDS[i]}</span><b class="${s.n?'':'extinct'}">${s.n?'N = '+s.n:'已灭绝'}</b></div><div class="ledger-values"><span>体色 <b>${format(s.mean[0],2)}</b></span><span>耐热 <b>${format(s.mean[1],2)}</b></span><span>H <b>${format(s.diversity,3)}</b></span></div></div>`).join('');
    const metric=$('trendMetric').value,history=world.history.slice(-301),lastStart=history[0]?.generation||0;
    const accessor=s=>metric==='color'?s.mean[0]:metric==='heat'?s.mean[1]:s[metric];
    V.lines($('trend'),m.islands.map((_,i)=>({color:V.colors[i],points:history.map(h=>[h.generation,accessor(h.islands[i])])})),{xmin:lastStart,ymax:metric==='n'?undefined:metric==='diversity'?.5:1,integer:metric==='n'});
    V.histogram($('histogram'),m,+$('histTrait').value);
    if(m.total===0&&running){stop();toast('全群岛已灭绝。不会自动补充个体；可重置重新实验。');}
  }
  function transport(){
    $('play').innerHTML=`<i data-lucide="${running?'pause':'play'}"></i><span>${running?'暂停演化':'开始演化'}</span>`;
    $('pairPlay').innerHTML=`<i data-lucide="${pairRunning?'pause':'play'}"></i><span>${pairRunning?'暂停对照':'并行演化'}</span>`;
    $('runState').textContent=running?'演化进行中':'已暂停';$('runState').classList.toggle('running',running);icons();
  }
  function stop(){running=false;pairRunning=false;clearInterval(timer);timer=null;transport();}
  function clock(){clearInterval(timer);const speed=activeTab==='live'?+$('speed').value:10;timer=setInterval(()=>{
    if(running){E.step(world);render();}
    if(pairRunning){E.stepPair(pair);renderPair();if(!E.metrics(pair.a).total&&!E.metrics(pair.b).total){stop();toast('两个世界均已灭绝，可重建实验。');}}
  },1000/speed);}
  function action(a){E.applyAction(world,a);syncControls();renderEvents();render();}
  $('play').onclick=()=>{if(!E.metrics(world).total){toast('种群已灭绝，请重置建立新实验。');return;}if(running)stop();else{running=true;clock();transport();}};
  $('step').onclick=()=>{stop();E.step(world);render();};$('speed').onchange=()=>{if(running)clock();};
  $('reset').onclick=()=>{stop();const seed=$('seed').value.trim()||'DARWIN-1835';$('seed').value=seed;world=E.createWorld(seed,world.config);selected=null;stale=false;syncControls();renderEvents();render();toast('已按当前参数与种子建立共同祖先群体。');};
  const factors={mutation:.01,migration:.01,selection:1,capacity:1};
  for(const key of Object.keys(factors)){
    $(key).addEventListener('input',()=>{const v=+$(key).value;$(key+'Out').textContent=key==='mutation'?v.toFixed(2)+'%':key==='migration'?Math.round(v)+'%':key==='selection'?v.toFixed(2):String(v);});
    $(key).addEventListener('change',()=>action({type:'parameters',[key]:+$(key).value*factors[key]}));
  }
  $('islandSelect').onchange=()=>{island=+$('islandSelect').value;selected=null;stale=false;syncControls();render();};
  for(const key of ['colorOpt','heatOpt']){
    $(key).addEventListener('input',()=>{$(key+'Out').textContent=(+$(key).value).toFixed(2);});
    $(key).addEventListener('change',()=>action({type:'environment',island,values:[+$('colorOpt').value,+$('heatOpt').value]}));
  }
  document.querySelectorAll('[data-edge]').forEach(b=>b.onclick=()=>{const edges=world.config.edges.slice();edges[+b.dataset.edge]=!edges[+b.dataset.edge];action({type:'edges',values:edges});});
  $('toggleAll').onclick=()=>action({type:'edges',values:Array(3).fill(!world.config.edges.some(Boolean))});
  $('bottleneck').onclick=()=>{const survivors=+$('survivors').value;if(!Number.isInteger(survivors)||survivors<0||survivors>999){toast('请输入0–999之间的整数。');return;}const before=world.islands[island].length;if(!before){toast('当前岛屿已没有个体。');return;}if(survivors>=before){toast('保留数不小于当前个体数，没有实施瓶颈。');return;}action({type:'bottleneck',island,survivors});toast(`${E.ISLANDS[island]}：${before} 个体 → ${survivors} 个体。`);};
  $('world').addEventListener('click',event=>{
    const rect=$('world').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    const nearest=hits.map(h=>({...h,d:(h.x-x)**2+(h.y-y)**2})).sort((a,b)=>a.d-b.d)[0];
    if(nearest&&nearest.d<225){island=nearest.island;selected=nearest.id;stale=false;syncControls();render();}
  });
  $('sampleIndividual').onclick=()=>{const ind=world.islands[island][0];if(!ind){toast('当前岛屿已灭绝，请选择另一个岛屿。');return;}selected=ind.id;stale=false;render();};
  $('trendMetric').onchange=render;$('histTrait').onchange=render;
  $('exportLog').onclick=()=>download('archipelago-replay.json',JSON.stringify({model:'archipelago-v1',seed:world.seed,initialConfig:world.initialConfig,events:world.events,until:world.generation,finalMetrics:E.metrics(world)},null,2),'application/json');

  const specs={
    migration:{metric:'divergence',metricLabel:'岛间性状差异 D',hypothesis:'环境不同且存在选择时，持续迁移通常会削弱岛间分化；但单次漂变、灭绝和选择强度可能改变结果。',conditions:'A：m = 12%；B：m = 0。其余参数相同，s = 1、μ = 0.002、K = 90。比较末代 D；只剩一个非空岛时 D 不可定义。',expected:'negative'},
    selection:{metric:'mismatch',metricLabel:'环境失配 M',hypothesis:'与无选择相比，有选择的群体通常更接近当地最适性状。但无选择的群体也可能偶然接近最适值，或在漂变下分化。',conditions:'A：s = 1.4；B：s = 0。两者 m = 1.5%、μ = 0.002、K = 90。比较末代 M，越低越匹配；它不是自然界中的适应度测量。',expected:'negative'},
    bottleneck:{metric:'diversity',metricLabel:'岛内基因多样性 H',hypothesis:'数量恢复，不等于遗传多样性恢复。无突变、无迁移时，瓶颈中丢失的等位变异不能再生；H 可能因剩余频率变化而回升，但并不表示丢失的等位变异返回。',conditions:'两者 s = μ = m = 0、K = 90。第20代，B每岛随机保留至多3个体；A无瓶颈。比较末代 H 和数量 N。漂变和灭绝可能导致单次结果不同。',expected:'positive'}
  };
  function clearBatch(){replicates=[];$('replicateResults').hidden=true;$('replicateProgress').hidden=true;$('replicateStatus').textContent='尚未运行。更换实验或种子后，重复结果会清空。';}
  function resetPair(){stop();const seed=$('pairSeed').value.trim()||'ISLAND-PAIR-01';$('pairSeed').value=seed;pair=E.createPair(experiment,seed);clearBatch();renderPair();}
  function renderPair(){
    if(activeTab!=='experiment')return;
    const s=specs[experiment];$('hypothesis').innerHTML=`<p><b>待检验的预期：</b>${s.hypothesis}</p><p><b>对照条件：</b>${s.conditions}</p>`;
    $('labelA').textContent=pair.labels[0];$('labelB').textContent=pair.labels[1];$('pairGen').textContent=`第 ${pair.a.generation} 代`;
    for(const key of ['a','b']){
      const id=key.toUpperCase(),m=E.metrics(pair[key]);$('pairN'+id).textContent='N = '+m.total;
      V.drawWorld($('world'+id),pair[key],{compact:true});
      $('pairStats'+id).innerHTML=`<span>D <b>${format(m.divergence)}</b></span><span>H <b>${format(m.diversity)}</b></span><span>失配 M <b>${format(m.mismatch)}</b></span><span>非空岛 <b>${m.islands.filter(i=>i.n).length}/3</b></span>`;
    }
    const metric=$('pairMetric').value;
    V.lines($('pairTrend'),['a','b'].map((k,i)=>({color:[V.colors[0],V.colors[2]][i],points:pair[k].history.slice(-301).map(h=>[h.generation,h[metric]])})),{xmin:Math.max(0,pair.a.generation-300),ymax:metric==='diversity'?.5:metric==='total'?undefined:undefined,integer:metric==='total'});
    if(replicates.length)renderReplicates();
  }
  document.querySelectorAll('[data-experiment]').forEach(b=>b.onclick=()=>{
    if(batchBusy)return;experiment=b.dataset.experiment;
    document.querySelectorAll('[data-experiment]').forEach(el=>{const active=el===b;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    $('pairMetric').value=specs[experiment].metric;resetPair();
  });
  $('pairSeed').onchange=()=>{if(!batchBusy)resetPair();};$('pairReset').onclick=resetPair;
  $('pairPlay').onclick=()=>{if(batchBusy)return;if(pairRunning)stop();else{running=false;pairRunning=true;clock();transport();}};
  $('pairStep').onclick=()=>{if(batchBusy)return;stop();E.stepPair(pair);renderPair();};$('pairMetric').onchange=renderPair;
  function batchControls(busy){
    batchBusy=busy;
    ['pairSeed','pairReset','pairPlay','pairStep','replicateCount','replicateGenerations','runReplicates'].forEach(id=>$(id).disabled=busy);
    document.querySelectorAll('[data-experiment]').forEach(b=>b.disabled=busy);$('cancelReplicates').hidden=!busy;
  }
  $('cancelReplicates').onclick=()=>{batchCancelled=true;};
  $('runReplicates').onclick=async()=>{
    stop();clearBatch();batchCancelled=false;batchControls(true);
    const count=+$('replicateCount').value,gens=+$('replicateGenerations').value,seed=$('pairSeed').value,results=[];
    $('replicateProgress').hidden=false;$('replicateProgress').max=count;$('replicateProgress').value=0;
    try{
      for(let j=0;j<count;j++){
        await new Promise(resolve=>setTimeout(resolve,12));if(batchCancelled)break;
        results.push(E.runReplicate(experiment,seed+'|replicate|'+(j+1),gens));
        $('replicateProgress').value=j+1;$('replicateStatus').textContent=`已完成 ${j+1} / ${count} 对世界，每对 ${gens} 代。`;
      }
      if(batchCancelled){$('replicateStatus').textContent=`已取消；${results.length} 次部分结果未用于结论。`;return;}
      replicates=results;$('replicateStatus').textContent=`完成 ${count} 次配对重复，每次 ${gens} 代。下方是独立重跑的末代结果，不接续上方单次演化。`;
      $('replicateResults').hidden=false;requestAnimationFrame(renderReplicates);
    }catch(error){$('replicateStatus').textContent='实验未完成：'+error.message;}
    finally{batchControls(false);$('replicateProgress').hidden=true;}
  };
  function differences(){const key=specs[experiment].metric;return replicates.map(r=>r.a[key]===null||r.b[key]===null?null:r.a[key]-r.b[key]);}
  function renderReplicates(){
    if(!replicates.length)return;
    const spec=specs[experiment],d=differences(),valid=d.filter(x=>x!==null),n=valid.length,mean=n?valid.reduce((s,x)=>s+x,0)/n:null,sd=n>1?Math.sqrt(valid.reduce((s,x)=>s+(x-mean)**2,0)/(n-1)):null;
    const positive=valid.filter(x=>x>1e-12).length,zero=valid.filter(x=>Math.abs(x)<=1e-12).length,consistent=valid.filter(x=>spec.expected==='positive'?x>1e-12:x< -1e-12).length;
    const extA=replicates.filter(r=>r.a.total===0).length,extB=replicates.filter(r=>r.b.total===0).length;
    $('replicateNumbers').innerHTML=`<div class="replicate-number"><span>有效配对</span><strong>${n} / ${replicates.length}</strong><small>未定义指标单独排除</small></div><div class="replicate-number"><span>平均差值 A−B</span><strong>${format(mean,4)}</strong><small>${spec.metricLabel}</small></div><div class="replicate-number"><span>差值标准差</span><strong>${format(sd,4)}</strong><small>描述重复间波动，非标准误</small></div><div class="replicate-number"><span>符合预期方向</span><strong>${consistent} / ${n}</strong><small>不是显著性检验</small></div>`;
    $('replicatePlotTitle').textContent=spec.metricLabel+' · 成对差值';V.differences($('replicatePlot'),d);
    const direction=mean===null?'没有足够的可定义结果':mean>0?'A 的平均值高于 B':mean<0?'A 的平均值低于 B':'A 与 B 的平均值相同';
    const extra=experiment==='bottleneck'?`末代平均数量：A ${(replicates.reduce((s,r)=>s+r.a.total,0)/replicates.length).toFixed(1)}，B ${(replicates.reduce((s,r)=>s+r.b.total,0)/replicates.length).toFixed(1)}。数量相近不意味着等位变异集合相同。`:experiment==='selection'?'失配越低表示表型更接近环境最适值；不要拿无选择世界的 w=1 与有选择世界的 w 直接比较适应水平。':'迁移可能削弱局地分化，也可能拯救小群体；一个指标不能代表所有生态后果。';
    $('replicateInterpretation').textContent=`本次重复中，${direction}。${positive} 次 A−B>0，${n-positive-zero} 次 A−B<0，${zero} 次近于0；${replicates.length-n} 次指标未定义。全群岛灭绝：A ${extA} 次，B ${extB} 次。${extra} 这些结论只针对当前模型和参数，不保证每个种子都符合预期。`;
    $('replicateTableHead').innerHTML='<tr><th>重复</th><th>A 指标</th><th>B 指标</th><th>A−B</th><th>A / B 个体数</th><th>A / B 非空岛</th><th>种子</th></tr>';
    $('replicateTableBody').innerHTML=replicates.map((r,j)=>`<tr><td>${j+1}</td><td>${format(r.a[spec.metric],4)}</td><td>${format(r.b[spec.metric],4)}</td><td>${format(d[j],4)}</td><td>${r.a.total} / ${r.b.total}</td><td>${r.a.islands.filter(i=>i.n).length} / ${r.b.islands.filter(i=>i.n).length}</td><td>${escape(r.seed)}</td></tr>`).join('');
  }
  $('exportResults').onclick=()=>{
    const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
    const header=['replicate','seed','generation','A_N','B_N','A_D','B_D','A_H','B_H','A_M','B_M','A_alive_islands','B_alive_islands'];
    const rows=replicates.map((r,j)=>[j+1,r.seed,r.a.generation,r.a.total,r.b.total,r.a.divergence,r.b.divergence,r.a.diversity,r.b.diversity,r.a.mismatch,r.b.mismatch,r.a.islands.filter(i=>i.n).length,r.b.islands.filter(i=>i.n).length]);
    download('archipelago-'+experiment+'.csv','\ufeff'+[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  $('runTests').onclick=async()=>{
    $('runTests').disabled=true;$('testSummary').textContent='正在运行实际模拟检查…';
    await new Promise(resolve=>setTimeout(resolve,20));
    const results=E.selfTests();$('testSummary').textContent=`${results.filter(r=>r.pass).length} / ${results.length} 项通过`;
    $('testResults').innerHTML=results.map(r=>`<li class="${r.pass?'pass':'fail'}"><b><i data-lucide="${r.pass?'check-circle-2':'circle-x'}"></i>${r.name}</b><p>${escape(r.detail)}</p></li>`).join('');
    $('runTests').disabled=false;icons();
  };
  $('guideBtn').onclick=()=>$('guide').showModal();$('closeGuide').onclick=()=>$('guide').close();$('startGuide').onclick=()=>{$('guide').close();activate('live');};
  $('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=$('guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('guide').close();}});
  let resizePending=false;window.addEventListener('resize',()=>{if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(activeTab==='live')render();else if(activeTab==='experiment')renderPair();});});
  window.addEventListener('pagehide',stop);
  function publicState(){const m=E.metrics(world);return {seed:world.seed,generation:world.generation,config:E.clone(world.config),metrics:m,events:E.clone(world.events)};}
  const api={get world(){return world;},get pair(){return pair;},get hits(){return hits;},get replicates(){return replicates;},state:publicState,activate,render,stop,
    setWorld(w){stop();world=w;selected=null;syncControls();renderEvents();render();},
    apply(a){action(a);return publicState();},advance(n=1){if(!Number.isInteger(n)||n<1||n>500)throw Error('代数必须为1–500整数');stop();for(let j=0;j<n;j++)E.step(world);render();return publicState();}};
  window.archipelago=api;
  const registry=document.modelContext;
  if(registry?.registerTool){
    const lifecycle=new AbortController();
    const tools=[
      {name:'read_evolution_state',title:'读取群岛状态',description:'读取当前演化现场的参数、世代与统计量，不修改状态。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>publicState()},
      {name:'advance_evolution',title:'推进演化',description:'暂停自动演化并按当前参数前进指定世代，更新现场与图表。',inputSchema:{type:'object',properties:{generations:{type:'integer',minimum:1,maximum:500}},required:['generations'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='generations'))throw Error('输入字段无效');activate('live');return api.advance(input.generations);}}
    ];
    for(const tool of tools)try{Promise.resolve(registry.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  syncControls();renderEvents();icons();requestAnimationFrame(render);
})();
