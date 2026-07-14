(function () {
  "use strict";
  const D=window.__NORDIC_PUBLIC__, stage=window.__NORDIC_STAGE;
  const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const api=window.__NORDIC_ATMO={
    ready:false,errors:[],year:2023,reducedMotion:reduced,particleCount:0,
    activeParticleCount:0,resolvedShare:0,pathCounts:{},mode:reduced?"static-svg":"live-svg"
  };
  if(!D||!stage||!stage.particleHost){api.errors.push("missing data, stage, or SVG particle host");return;}
  const NS="http://www.w3.org/2000/svg";
  const COLORS={oceanic:"#6ff7eb",other_terrestrial:"#ffc16f",sweden:"#68f3bd",finland:"#a7d9f3",baltics:"#d0b2ff"};
  const particles=[],sparks=[];
  let seed=7419,last=performance.now(),frame=0;
  function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function el(name,cls){const node=document.createElementNS(NS,name);node.setAttribute("class",cls);stage.particleHost.appendChild(node);return node;}
  function clear(){while(stage.particleHost.firstChild)stage.particleHost.removeChild(stage.particleHost.firstChild);particles.length=0;sparks.length=0;}
  function reset(){
    clear();seed=7419+api.year;api.pathCounts={};
    const shares=D.moisture.shares_by_year[String(api.year)],tracks=stage.flowTracks||[];
    api.resolvedShare=1-shares.residual_outside_domain;
    const mobile=Math.min(innerWidth,innerHeight)<620,total=reduced?(mobile?70:120):(mobile?150:300);
    const weighted=tracks.map(track=>({track,weight:shares[track.key]*track.shareOfClass}));
    const denom=weighted.reduce((s,d)=>s+d.weight,0);let made=0;
    weighted.forEach((entry,index)=>{
      const n=index===weighted.length-1?total-made:Math.max(1,Math.round(total*entry.weight/denom));
      api.pathCounts[entry.track.id]=n;made+=n;
      for(let i=0;i<n;i++){
        const line=el("line",`nf-live-tail ${entry.track.key}`),dot=el("circle",`nf-live-particle ${entry.track.key}`);
        line.style.stroke=COLORS[entry.track.key];dot.style.fill=COLORS[entry.track.key];
        const particle={track:entry.track,u:random()*1.12-.12,speed:.026+random()*.018,size:1.15+random()*1.35,alpha:.52+random()*.43,line,dot};
        dot.setAttribute("r",particle.size.toFixed(2));particles.push(particle);
      }
    });
    for(let i=0;i<16;i++){
      const streak=el("line","nf-rain-streak"),pulse=el("circle","nf-rain-spark");
      sparks.push({streak,pulse,life:0,offset:0,length:0});
    }
    api.particleCount=particles.length;
  }
  function launchSpark(q){
    const spark=sparks.find(s=>s.life<=0);if(!spark)return;
    spark.life=1;spark.offset=(random()-.5)*10;spark.length=5+random()*12;
    spark.streak.setAttribute("x1",q[0]+spark.offset);spark.streak.setAttribute("y1",q[1]);
    spark.pulse.setAttribute("cx",q[0]+spark.offset);spark.pulse.setAttribute("cy",q[1]);
  }
  function render(now){
    const dt=Math.min(.05,(now-last)/1000||.016);last=now;frame++;
    const scene=stage.currentScene,visible=scene==="moisture"||scene==="hook"||scene==="blindspot";
    stage.particleHost.style.opacity=visible?"1":"0";
    const intensity=scene==="moisture"?1:.42;let active=0;
    for(const p of particles){
      if(!reduced&&visible){p.u+=p.speed*dt*(scene==="moisture"?1:.72);if(p.u>=1){const q=stage.projectFlow(p.track,1);if(q)launchSpark(q);p.u=-random()*.2;}}
      if(!visible||p.u<0){p.dot.style.opacity="0";p.line.style.opacity="0";continue;}
      const u=Math.max(0,Math.min(1,p.u)),q=stage.projectFlow(p.track,u),prev=stage.projectFlow(p.track,Math.max(0,u-.022));
      if(!q||!prev)continue;active++;
      const fade=Math.sin(Math.PI*u),shimmer=.78+.22*Math.sin(frame*.05+p.u*19),opacity=p.alpha*fade*intensity;
      p.dot.setAttribute("cx",q[0]);p.dot.setAttribute("cy",q[1]);p.dot.style.opacity=(opacity*shimmer).toFixed(3);
      p.line.setAttribute("x1",prev[0]);p.line.setAttribute("y1",prev[1]);p.line.setAttribute("x2",q[0]);p.line.setAttribute("y2",q[1]);p.line.style.opacity=(opacity*.45).toFixed(3);
    }
    for(const s of sparks){
      if(!visible||s.life<=0){s.streak.style.opacity="0";s.pulse.style.opacity="0";continue;}
      const y=Number(s.streak.getAttribute("y1"));s.streak.setAttribute("y2",y+s.length*(1-s.life)+4);
      s.streak.setAttribute("x2",s.streak.getAttribute("x1"));s.streak.style.opacity=(s.life*intensity).toFixed(3);
      s.pulse.setAttribute("r",(7*s.life).toFixed(2));s.pulse.style.opacity=(s.life*.7*intensity).toFixed(3);
      if(!reduced)s.life-=dt*1.8;
    }
    api.activeParticleCount=active;
    requestAnimationFrame(render);
  }
  api.setYear=year=>{api.year=Number(year);stage.setFlowYear?.(api.year);reset();};
  reset();api.ready=true;requestAnimationFrame(render);
})();
