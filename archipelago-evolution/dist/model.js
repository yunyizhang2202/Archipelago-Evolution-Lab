(function (root) {
  'use strict';
  const LOCI = 12;
  const BITS = 24;
  const MASK = 0xffffff;
  const ISLANDS = ['青苔岛', '沙洲岛', '赤岩岛'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function hash(value) {
    let h = 2166136261;
    for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(seed);
    return function () {
      a |= 0; a = a + 0x6d2b79f5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function popcount(n) {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  function traits(genome) { return [popcount(genome & 4095) / LOCI, popcount(genome >>> LOCI) / LOCI]; }
  function defaults() {
    return {mutation: .002, migration: .03, selection: 1, capacity: 90, growth: 3.4, width: .38,
      edges: [true, true, true], environments: [[.18, .24], [.5, .52], [.82, .8]]};
  }
  function config(input = {}) {
    const c = {...defaults(), ...clone(input)};
    for (const [key, lo, hi] of [['mutation',0,.1],['migration',0,1],['selection',0,4],['capacity',1,240],['growth',1.01,8],['width',.05,1]]) {
      if (!Number.isFinite(c[key]) || c[key] < lo || c[key] > hi) throw Error('参数超出范围: ' + key);
    }
    c.capacity = Math.round(c.capacity);
    if (c.edges.length !== 3 || c.edges.some(e => typeof e !== 'boolean')) throw Error('需要三个布尔迁移连接');
    if (c.environments.length !== 3 || c.environments.some(e => e.length !== 2 || e.some(v => !Number.isFinite(v) || v < 0 || v > 1))) throw Error('环境最适值应介于0与1之间');
    return c;
  }
  function fitness(genome, environment, c) {
    if (c.selection === 0) return 1;
    const t = traits(genome);
    const d2 = (t[0]-environment[0])**2 + (t[1]-environment[1])**2;
    return Math.exp(-c.selection*d2/(2*c.width**2));
  }
  function mismatch(genome, environment) {
    const t=traits(genome);
    return ((t[0]-environment[0])**2+(t[1]-environment[1])**2)/2;
  }
  // A sum of independent Poisson variables is Poisson; small blocks avoid underflow.
  function poisson(lambda, random) {
    let out=0;
    while(lambda > 1e-12) {
      const part=Math.min(20,lambda), threshold=Math.exp(-part);
      let p=1, k=0;
      do {k++;p*=random();} while(p>threshold);
      out+=k-1;lambda-=part;
    }
    return out;
  }
  function mutation(genome, rate, random) {
    if (rate === 0) return genome;
    let g=genome;
    for(let b=0;b<BITS;b++) if(random()<rate) g ^= 1<<b;
    return g & MASK;
  }
  function neighbors(i, edges) {
    const pairs=[[0,1],[1,2],[0,2]], list=[];
    pairs.forEach(([a,b],k)=>{if(edges[k]) {if(a===i)list.push(b);if(b===i)list.push(a);}});
    return list;
  }
  function metrics(world) {
    const islands=world.islands.map((individuals,i)=> {
      const n=individuals.length, counts=Array(BITS).fill(0), hist=[Array(13).fill(0),Array(13).fill(0)];
      let sum=[0,0], meanW=0, error=0;
      for(const ind of individuals) {
        const t=traits(ind.g);
        sum[0]+=t[0];sum[1]+=t[1];
        hist[0][Math.round(t[0]*LOCI)]++;hist[1][Math.round(t[1]*LOCI)]++;
        meanW+=fitness(ind.g,world.config.environments[i],world.config);
        error+=mismatch(ind.g,world.config.environments[i]);
        for(let b=0;b<BITS;b++) counts[b]+=(ind.g>>>b)&1;
      }
      const alleleFreq=counts.map(k=>n?k/n:null);
      const diversity=n?alleleFreq.reduce((s,p)=>s+2*p*(1-p),0)/BITS:null;
      const fixed=n?counts.filter(k=>k===0||k===n).length:0;
      return {n,mean:n?sum.map(s=>s/n):[null,null],hist,diversity,fixed,
        fitness:n?meanW/n:null,mismatch:n?error/n:null,alleleFreq};
    });
    const live=islands.filter(i=>i.n>0), total=islands.reduce((s,i)=>s+i.n,0);
    let divergence=0,pairs=0;
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++) {
      divergence+=Math.hypot(live[i].mean[0]-live[j].mean[0],live[i].mean[1]-live[j].mean[1])/Math.SQRT2;pairs++;
    }
    return {generation:world.generation,total,islands,divergence:pairs?divergence/pairs:null,
      diversity:total?islands.reduce((s,i)=>s+(i.diversity??0)*i.n,0)/total:null,
      mismatch:total?islands.reduce((s,i)=>s+(i.mismatch??0)*i.n,0)/total:null,
      migrants:world.lastMigration.length};
  }
  function record(world) {
    const m=metrics(world);
    const h={generation:m.generation,total:m.total,divergence:m.divergence,diversity:m.diversity,mismatch:m.mismatch,
      islands:m.islands.map(i=>({n:i.n,mean:i.mean,diversity:i.diversity,fitness:i.fitness,mismatch:i.mismatch}))};
    if(world.history.at(-1)?.generation===world.generation)world.history[world.history.length-1]=h;
    else world.history.push(h);
    return m;
  }
  function createWorld(seed='DARWIN-1835', settings={}) {
    const c=config(settings), rand=rng(seed+'|ancestor'), ancestors=[];
    for(let j=0;j<c.capacity;j++) {
      let g=0;for(let b=0;b<BITS;b++)if(rand()<.5)g|=1<<b;
      ancestors.push(g);
    }
    const world={seed:String(seed),generation:0,config:c,initialConfig:clone(c),islands:[],history:[],events:[],lastMigration:[],actionCount:0};
    world.islands=ISLANDS.map((_,i)=>ancestors.map((g,j)=>({id:`0:${i}:${j}`,g,parent:null,birthIsland:i,island:i,generation:0,mutations:0})));
    record(world);return world;
  }
  function step(world) {
    const next=[[],[],[]], generation=world.generation+1, c=world.config;
    world.lastMigration=[];
    for(let i=0;i<3;i++) {
      const adults=world.islands[i],n=adults.length;
      if(!n)continue;
      const cumulative=[];let sum=0;
      for(const ind of adults) {sum+=fitness(ind.g,c.environments[i],c);cumulative.push(sum);}
      const lambda=c.growth*sum/(1+(c.growth-1)*n/c.capacity);
      // Separate deterministic streams keep counterfactual runs paired without using rendering randomness.
      const key=world.seed+'|'+generation+'|'+i;
      const nr=rng(key+'|N'),pr=rng(key+'|parent'),mr=rng(key+'|mutate'),dr=rng(key+'|disperse');
      const count=poisson(lambda,nr), destinations=neighbors(i,c.edges);
      for(let j=0;j<count;j++) {
        const target=pr()*sum;let lo=0,hi=n-1;
        while(lo<hi){const mid=(lo+hi)>>>1;if(cumulative[mid]>target)hi=mid;else lo=mid+1;}
        const parent=adults[lo],g=mutation(parent.g,c.mutation,mr);
        const move=dr(),where=dr();
        const destination=destinations.length && move<c.migration?destinations[Math.floor(where*destinations.length)]:i;
        const ind={id:`${generation}:${i}:${j}`,g,parent:parent.id,birthIsland:i,island:destination,generation,mutations:popcount(g^parent.g)};
        next[destination].push(ind);
        if(destination!==i)world.lastMigration.push({id:ind.id,from:i,to:destination});
      }
    }
    world.islands=next;world.generation=generation;return record(world);
  }
  function applyAction(world,action) {
    const a=clone(action);
    if(a.type==='parameters') {
      const patch={};for(const key of ['mutation','migration','selection','capacity']) if(key in a)patch[key]=a[key];
      world.config=config({...world.config,...patch});
    } else if(a.type==='environment') {
      if(!Number.isInteger(a.island)||a.island<0||a.island>2)throw Error('岛屿编号无效');
      const env=clone(world.config.environments);env[a.island]=a.values;
      world.config=config({...world.config,environments:env});
    } else if(a.type==='edges') world.config=config({...world.config,edges:a.values});
    else if(a.type==='bottleneck') {
      if(!Number.isInteger(a.island)||a.island<0||a.island>2||!Number.isInteger(a.survivors)||a.survivors<0)throw Error('瓶颈参数无效');
      const inds=world.islands[a.island].slice(),random=rng(world.seed+'|bottleneck|'+world.generation+'|'+world.actionCount);
      for(let j=inds.length-1;j>0;j--){const k=Math.floor(random()*(j+1));[inds[j],inds[k]]=[inds[k],inds[j]];}
      world.islands[a.island]=inds.slice(0,a.survivors);
      world.lastMigration=[];
    } else throw Error('未知操作');
    world.events.push({at:world.generation,action:a});world.actionCount++;return record(world);
  }
  function replay(seed,initialConfig,events,until) {
    const w=createWorld(seed,initialConfig);
    for(let g=0;g<=until;g++) {
      events.filter(e=>e.at===g).forEach(e=>applyAction(w,e.action));
      if(g<until)step(w);
    }
    return w;
  }
  function experimentSettings(type) {
    const base=defaults();
    if(type==='selection')return {a:{...base,migration:.015,selection:1.4},b:{...base,migration:.015,selection:0},labels:['A · 有自然选择','B · 无自然选择']};
    if(type==='bottleneck')return {a:{...base,mutation:0,migration:0,selection:0},b:{...base,mutation:0,migration:0,selection:0},labels:['A · 无瓶颈','B · 第20代瓶颈']};
    return {a:{...base,migration:.12},b:{...base,migration:0},labels:['A · 保持迁移','B · 切断迁移']};
  }
  function createPair(type,seed) {
    if(!['migration','selection','bottleneck'].includes(type))throw Error('实验类型无效');
    const c=experimentSettings(type);
    return {type,seed:String(seed),a:createWorld(seed,c.a),b:createWorld(seed,c.b),labels:c.labels};
  }
  function stepPair(pair) {
    step(pair.a);step(pair.b);
    if(pair.type==='bottleneck'&&pair.b.generation===20)for(let i=0;i<3;i++)applyAction(pair.b,{type:'bottleneck',island:i,survivors:3});
    return {a:metrics(pair.a),b:metrics(pair.b)};
  }
  function pairSummary(pair) {return {seed:pair.seed,a:metrics(pair.a),b:metrics(pair.b)};}
  function runReplicate(type,seed,generations=100) {
    const pair=createPair(type,seed);for(let g=0;g<generations;g++)stepPair(pair);return pairSummary(pair);
  }
  function selfTests() {
    const results=[];
    function test(name,fn){try{const detail=fn();results.push({name,pass:true,detail});}catch(e){results.push({name,pass:false,detail:e.message});}}
    const assert=(cond,msg)=>{if(!cond)throw Error(msg);};
    test('关闭突变：没有新增基因型',()=>{
      const w=createWorld('test-mutation',{mutation:0});const initial=new Set(w.islands.flat().map(i=>i.g));
      for(let g=0;g<60;g++){step(w);assert(w.islands.flat().every(i=>initial.has(i.g)),'发现新基因型');}
      return '60代，所有后代基因型都属于祖先集合';
    });
    test('切断迁移：没有跨岛流动',()=>{
      const w=createWorld('test-migration',{migration:1,edges:[false,false,false]});
      const z=createWorld('test-migration-zero',{migration:0,edges:[true,true,true]});
      for(let g=0;g<40;g++)for(const state of [w,z]){step(state);assert(state.lastMigration.length===0&&state.islands.every((p,k)=>p.every(i=>i.birthIsland===k)),'出现跨岛个体');}
      return '断开全部连接，或将迁移率设为0，分别运行40代均无跨岛流动';
    });
    test('同一随机种子与操作：完整复现',()=>{
      const w=createWorld('test-replay');
      for(let g=0;g<35;g++){
        if(g===3)applyAction(w,{type:'environment',island:0,values:[.7,.9]});
        if(g===8)applyAction(w,{type:'bottleneck',island:2,survivors:7});
        if(g===13)applyAction(w,{type:'edges',values:[false,true,false]});
        step(w);
      }
      const r=replay(w.seed,w.initialConfig,w.events,w.generation);
      assert(JSON.stringify(w)===JSON.stringify(r),'重放不一致');return '环境变化、瓶颈、断开连接均逐个体复现';
    });
    test('关闭选择：环境不改变演化轨迹',()=>{
      const a=createWorld('test-neutral',{selection:0}),b=createWorld('test-neutral',{selection:0,environments:[[1,0],[0,1],[1,1]]});
      for(let g=0;g<50;g++){step(a);step(b);assert(JSON.stringify(a.islands)===JSON.stringify(b.islands),'环境影响了中性繁殖');}
      return '两个完全不同的环境，50代逐个体轨迹一致；漂变仍存在';
    });
    test('图表计数：与个体集合完全一致',()=>{
      const w=createWorld('test-count');
      for(let g=0;g<30;g++){
        if(g===4)applyAction(w,{type:'bottleneck',island:1,survivors:5});
        step(w);const m=metrics(w),h=w.history.at(-1);
        assert(m.total===w.islands.flat().length&&h.total===m.total,'总数不符');
        m.islands.forEach((s,i)=>assert(s.n===w.islands[i].length&&s.hist.every(bins=>bins.reduce((x,y)=>x+y,0)===s.n)&&h.islands[i].n===s.n,'直方图或历史计数不符'));
      }
      return '逐岛个体数、两种性状直方图和历史曲线一致';
    });
    test('灭绝与固定：没有隐形补充',()=>{
      const w=createWorld('test-extinction',{mutation:0,migration:0,selection:0});
      applyAction(w,{type:'bottleneck',island:0,survivors:0});
      for(const ind of w.islands[1])ind.g=0;
      for(let g=0;g<30;g++){step(w);assert(w.islands[0].length===0,'空岛被补充');const fixed=metrics(w).islands[1];assert(fixed.n>0&&fixed.fixed===24&&fixed.diversity===0&&fixed.hist[0][0]===fixed.n&&w.islands[1].every(i=>i.g===0),'非空固定种群或直方图被改变');}
      assert(metrics(w).islands[0].mean[0]===null,'空岛不应显示零均值');return '隔离空岛保持灭绝；固定基因型不被人为恢复';
    });
    test('成对实验：共享完全相同的祖先',()=>{
      for(const type of ['migration','selection','bottleneck']){
        const p=createPair(type,'test-pair');assert(JSON.stringify(p.a.islands)===JSON.stringify(p.b.islands),'初始个体不同');
      }return '三个实验的A/B初始个体与基因型完全一致';
    });
    test('突变方向：包含有利与有害变化',()=>{
      const c=defaults(),g=0x555555,env=[.8,.8],w=fitness(g,env,c),changes=[];
      for(let b=0;b<BITS;b++)changes.push(fitness(g^(1<<b),env,c)-w);
      assert(changes.some(d=>d>0)&&changes.some(d=>d<0),'突变效应没有双向性');return '同一基因型的24种单点突变同时包含有利与有害效应';
    });
    return results;
  }
  root.EvoLab={LOCI,BITS,ISLANDS,hash,rng,clone,traits,fitness,mismatch,defaults,config,poisson,mutation,neighbors,
    metrics,createWorld,step,applyAction,replay,experimentSettings,createPair,stepPair,pairSummary,runReplicate,selfTests};
})(globalThis);
