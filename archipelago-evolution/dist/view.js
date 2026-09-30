(function(root){
  'use strict';
  const E=root.EvoLab, colors=['#238363','#ae8627','#bd547b'];
  const fmt=(v,d=3)=>v===null||v===undefined||!Number.isFinite(v)?'—':Number(v).toFixed(d);
  function fit(canvas){
    const rect=canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height),dpr=Math.min(root.devicePixelRatio||1,2);
    if(!w||!h)return null;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return {ctx,w,h};
  }
  function pigment(v){return `rgb(${Math.round(28+194*v)},${Math.round(156-56*v)},${Math.round(139-4*v)})`;}
  function terrain(v){return `rgb(${Math.round(197+37*v)},${Math.round(225-26*v)},${Math.round(210-2*v)})`;}
  function land(ctx,x,y,rx,ry,factor=1){
    ctx.beginPath();
    for(let j=0;j<=64;j++){
      const a=j/64*Math.PI*2,f=(1+.085*Math.sin(a*3+.5)+.045*Math.cos(a*5+1))*factor;
      const px=x+Math.cos(a)*rx*f,py=y+Math.sin(a)*ry*f;
      if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }
  function organism(ctx,x,y,c,t,size,angle=0,outline=false){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    const a=size*(1+.55*t),b=size*.66;
    ctx.fillStyle=pigment(c);ctx.strokeStyle=outline?'#fff':'#173c3444';ctx.lineWidth=outline?.9:.45;
    ctx.beginPath();ctx.ellipse(0,0,a,b,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(size>4){ctx.fillStyle='#ffffff9c';ctx.beginPath();ctx.ellipse(-a*.21,-b*.24,a*.46,b*.27,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17342e';ctx.beginPath();ctx.arc(a*.59,0,Math.max(.8,size*.095),0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function drawWorld(canvas,world,options={}){
    const f=fit(canvas);if(!f)return [];
    const {ctx,w,h}=f,compact=options.compact,top=compact?5:25;
    ctx.fillStyle='#eff6f5';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#dceae5';ctx.lineWidth=.65;
    for(let y=18;y<h;y+=28){ctx.beginPath();for(let x=0;x<=w;x+=12){const yy=y+Math.sin(x/85+y*.06)*2; x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();}
    const rx=w*.19,ry=h*.153,centers=[[w*.235,h*.355+top],[w*.758,h*.32+top],[w*.5,h*.732]],pairs=[[0,1],[1,2],[0,2]];
    pairs.forEach(([a,b],k)=>{
      const p=centers[a],q=centers[b];ctx.save();ctx.setLineDash(world.config.edges[k]?[4,6]:[2,9]);ctx.lineWidth=world.config.edges[k]?1.5:1;ctx.strokeStyle=world.config.edges[k]?'#73a994':'#c6d3ce';
      ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();ctx.setLineDash([]);
      const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;
      if(!world.config.edges[k]){ctx.strokeStyle='#97aaa1';ctx.beginPath();ctx.moveTo(mx-3,my-3);ctx.lineTo(mx+3,my+3);ctx.moveTo(mx+3,my-3);ctx.lineTo(mx-3,my+3);ctx.stroke();}
      else if(!compact){const n=world.lastMigration.filter(m=>(m.from===a&&m.to===b)||(m.from===b&&m.to===a)).length;if(n){ctx.fillStyle='#f6faf8';ctx.fillRect(mx-11,my-9,22,18);ctx.fillStyle='#44705e';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(String(n),mx,my+4);}}
      ctx.restore();
    });
    const hits=[];
    centers.forEach(([x,y],island)=>{
      const env=world.config.environments[island],inds=world.islands[island];
      land(ctx,x,y+3,rx,ry,1.16);ctx.fillStyle='#dcece5';ctx.fill();
      land(ctx,x,y+1,rx,ry,1.08);ctx.fillStyle='#f7f6e9';ctx.fill();ctx.strokeStyle='#cdd8c4';ctx.lineWidth=.7;ctx.stroke();
      land(ctx,x,y,rx,ry,.99);ctx.fillStyle=terrain(env[0]);ctx.fill();
      if(options.island===island){ctx.strokeStyle='#629c7d';ctx.lineWidth=1.4;ctx.setLineDash([4,3]);land(ctx,x,y,rx,ry,1.19);ctx.stroke();ctx.setLineDash([]);}
      land(ctx,x+rx*.05,y-ry*.06,rx,ry,.72);ctx.fillStyle='#ffffff15';ctx.fill();ctx.strokeStyle='#ffffff33';ctx.lineWidth=.7;ctx.stroke();
      land(ctx,x+rx*.12,y-ry*.15,rx,ry,.45);ctx.strokeStyle='#91b69d33';ctx.stroke();
      const n=inds.length,baseSize=Math.max(2.3,Math.min(4.5,w/190)),shrink=n>130?Math.sqrt(130/n):1;
      inds.forEach((ind,j)=>{
        const rr=Math.sqrt((j+.5)/Math.max(n,1))*.83,angle=j*2.39996323+island*.8;
        const dx=Math.cos(angle)*rx*rr,dy=Math.sin(angle)*ry*rr;
        const px=x+dx,py=y+dy,t=E.traits(ind.g),pose=(E.hash(ind.id)%628)/100;
        if(options.selected===ind.id){ctx.beginPath();ctx.arc(px,py,baseSize*2.5,0,Math.PI*2);ctx.strokeStyle='#17342e';ctx.lineWidth=1.5;ctx.stroke();}
        organism(ctx,px,py,t[0],t[1],baseSize*shrink,pose,options.selected===ind.id);
        hits.push({x:px,y:py,id:ind.id,island});
      });
      if(n===0){ctx.fillStyle='#6e8377';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('已灭绝',x,y+4);}
      ctx.textAlign='center';ctx.fillStyle='#294a3a';ctx.font=`600 ${compact?10:11}px sans-serif`;ctx.fillText(`0${island+1}  ${E.ISLANDS[island]}`,x,y+ry*1.32);
      ctx.fillStyle='#5b7267';ctx.font=`${compact?9:10}px sans-serif`;ctx.fillText(`N ${n} · θ ${env[0].toFixed(2)} / ${env[1].toFixed(2)}`,x,y+ry*1.32+14);
    });
    canvas.dataset.renderedIndividuals=String(hits.length);
    return hits;
  }
  function specimen(canvas,ind){
    const f=fit(canvas);if(!f)return;const {ctx,w,h}=f;
    const cx=w/2,cy=h/2;
    ctx.strokeStyle='#e6ede6';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(cx,cy,Math.min(33,h*.39),0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(cx-45,cy);ctx.lineTo(cx+45,cy);ctx.moveTo(cx,cy-36);ctx.lineTo(cx,cy+36);ctx.stroke();ctx.setLineDash([]);
    if(ind){const [c,t]=E.traits(ind.g);organism(ctx,cx,cy,c,t,18,-.35);}
    else {ctx.fillStyle='#b1c3b6';ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.fill();}
  }
  function axes(ctx,w,h,{ymin=0,ymax=1,xmin=0,xmax=100,xlabel='世代',ylabel=''}){
    const left=42,right=15,top=17,bottom=30,pw=Math.max(1,w-left-right),ph=Math.max(1,h-top-bottom);
    const sx=x=>left+(x-xmin)/(xmax-xmin||1)*pw,sy=y=>top+ph-(y-ymin)/(ymax-ymin||1)*ph;
    ctx.font='10px sans-serif';ctx.lineWidth=.7;ctx.textAlign='right';
    for(let k=0;k<=4;k++){const v=ymin+(ymax-ymin)*k/4,y=sy(v);ctx.strokeStyle='#e5ebe6';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#718075';ctx.fillText(ymax>4?Math.round(v):v.toFixed(ymax<=.15?3:2),left-7,y+3);}
    ctx.textAlign='center';
    for(let k=0;k<=4;k++){const v=xmin+(xmax-xmin)*k/4;ctx.fillStyle='#718075';ctx.fillText(String(Math.round(v)),sx(v),h-13);}
    ctx.textAlign='right';ctx.fillStyle='#819087';ctx.fillText(xlabel,w-right,h-1);
    if(ylabel){ctx.textAlign='left';ctx.fillText(ylabel,left,10);}
    return {sx,sy,left,right,top,bottom,pw,ph};
  }
  function lines(canvas,series,options={}){
    const f=fit(canvas);if(!f)return;const {ctx,w,h}=f;
    const all=series.flatMap(s=>s.points).filter(p=>p[1]!==null&&Number.isFinite(p[1]));
    const xmax=Math.max(10,...series.flatMap(s=>s.points.map(p=>p[0]))),xmin=options.xmin??0;
    let ymax=options.ymax??Math.max(.01,...all.map(p=>p[1]))*1.16;
    if(options.integer)ymax=Math.max(20,Math.ceil(ymax/20)*20);
    const ax=axes(ctx,w,h,{ymax,xmax,xmin,xlabel:options.xlabel||'世代',ylabel:options.ylabel||''});
    series.forEach((s,i)=>{
      ctx.strokeStyle=s.color||colors[i];ctx.lineWidth=1.9;ctx.beginPath();let active=false;
      for(const [x,y]of s.points){if(y===null||!Number.isFinite(y)||x<xmin){active=false;continue;}if(!active){ctx.moveTo(ax.sx(x),ax.sy(y));active=true;}else ctx.lineTo(ax.sx(x),ax.sy(y));}ctx.stroke();
      const last=s.points.at(-1);if(last&&last[1]!==null){ctx.fillStyle=s.color||colors[i];ctx.beginPath();ctx.arc(ax.sx(last[0]),ax.sy(last[1]),3,0,Math.PI*2);ctx.fill();}
    });
    if(!all.length){ctx.fillStyle='#728579';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('没有可定义的数据',w/2,h/2);}
  }
  function histogram(canvas,stats,trait){
    const f=fit(canvas);if(!f)return;const {ctx,w,h}=f;
    const max=Math.max(4,...stats.islands.flatMap(s=>s.hist[trait]));
    const ax=axes(ctx,w,h,{ymax:Math.ceil(max*1.15),xmax:12,xlabel:'性状值',ylabel:'个体数'});
    ctx.clearRect(0,h-25,w,25);ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#718075';
    const group=ax.pw/13,bar=Math.max(1,group*.22);
    for(let j=0;j<13;j++){
      const x=ax.left+(j+.5)*group;
      for(let i=0;i<3;i++){const n=stats.islands[i].hist[trait][j],y=ax.sy(n);ctx.fillStyle=colors[i];ctx.globalAlpha=.85;ctx.fillRect(x+(i-1.5)*bar,y,bar-1,ax.sy(0)-y);ctx.globalAlpha=1;}
      if(j%3===0){ctx.fillStyle='#718075';ctx.fillText((j/12).toFixed(2),x,h-13);}
    }
    ctx.textAlign='right';ctx.fillText('性状值',w-15,h-1);
    canvas.dataset.counts=JSON.stringify(stats.islands.map(s=>s.hist[trait].reduce((x,y)=>x+y,0)));
  }
  function differences(canvas,values){
    const f=fit(canvas);if(!f)return;const {ctx,w,h}=f,valid=values.filter(v=>v!==null),max=Math.max(.005,...valid.map(Math.abs))*1.2;
    const left=45,right=20,top=16,bottom=32,sx=v=>left+(v+max)/(2*max)*(w-left-right),ph=h-top-bottom;
    ctx.font='10px sans-serif';ctx.textAlign='center';
    for(let j=0;j<=4;j++){const v=-max+max*j/2,x=sx(v);ctx.strokeStyle=j===2?'#a0b0a6':'#e5ece7';ctx.lineWidth=j===2?1.3:.7;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();ctx.fillStyle='#718075';ctx.fillText(v.toFixed(3),x,h-14);}
    values.forEach((v,j)=>{const y=top+(j+.5)/values.length*ph;ctx.fillStyle='#78877e';ctx.textAlign='right';if(j%Math.ceil(values.length/15)===0)ctx.fillText(String(j+1),left-10,y+3);if(v===null){ctx.fillStyle='#8b948e';ctx.textAlign='center';ctx.fillText('未定义',sx(0),y+3);return;}ctx.strokeStyle=v>=0?'#66ad8c':'#d38aa0';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(sx(0),y);ctx.lineTo(sx(v),y);ctx.stroke();ctx.fillStyle=v>=0?colors[0]:colors[2];ctx.beginPath();ctx.arc(sx(v),y,3.5,0,Math.PI*2);ctx.fill();});
    ctx.textAlign='left';ctx.fillStyle='#78877e';ctx.fillText('重复',4,10);ctx.textAlign='right';ctx.fillText('A − B',w-right,h-1);
  }
  root.EvoView={colors,fmt,fit,pigment,drawWorld,specimen,lines,histogram,differences};
})(globalThis);
