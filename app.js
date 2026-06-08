/* =================================================================
   智餐经营 · 前端逻辑
   - 用正常商业用语：营业额/利润/毛利率/成本/客单价/净利率
   - AI 优先调用后端(真实 DeepSeek)，后端没开则用内置引擎兜底
   ================================================================= */

/* ---------- 业态模型 ---------- */
const TYPES={
  快餐:{icon:"🍔",label:"快餐",hasSpeed:true,speedName:"出餐速度",
    bench:{food:[30,38],labor:[15,22],prime:[50,60],rent:[8,18],net:[10,18],speed:[0,180]},grossTarget:60,seedAvg:32},
  正餐:{icon:"🍲",label:"正餐",hasSpeed:false,
    bench:{food:[28,38],labor:[18,25],prime:[55,65],rent:[8,15],net:[8,15]},grossTarget:65,seedAvg:72},
  精致正餐:{icon:"🥂",label:"高档餐厅",hasSpeed:false,hasExp:true,
    bench:{food:[25,35],labor:[28,38],prime:[58,70],rent:[8,18],net:[6,14],exp:[90,100]},grossTarget:68,seedAvg:320},
  小吃:{icon:"🥟",label:"小吃",hasSpeed:true,speedName:"出餐速度",
    bench:{food:[30,40],labor:[12,20],prime:[48,60],rent:[8,18],net:[12,22],speed:[0,120]},grossTarget:62,seedAvg:22},
  饮品:{icon:"🧋",label:"奶茶/咖啡",hasSpeed:true,speedName:"出杯速度",
    bench:{food:[25,35],labor:[15,25],prime:[45,58],rent:[10,22],net:[12,25],speed:[0,150]},grossTarget:68,seedAvg:18}
};
const DBK="zhican_pro_v1";
function seedDishes(type){
  const P={
    快餐:[["招牌炸鸡",29,9,2200],["香辣鸡腿堡",22,7,1800],["薯条",12,3,2400],["可乐",8,1.5,2600],["鸡米花",16,5,700],["全家桶",69,26,420],["玉米杯",9,3,500],["蛋挞",7,2.5,650]],
    正餐:[["水煮鱼",88,28,640],["麻婆豆腐",36,8,820],["回锅肉",48,17,560],["夫妻肺片",42,11,420],["宫保鸡丁",46,18,560],["米饭",4,0.5,2100],["招牌牛蛙",78,24,210],["凉拌黄瓜",18,3,330]],
    精致正餐:[["和牛刺身",288,120,180],["鹅肝慕斯",168,58,220],["海胆意面",228,82,260],["龙虾浓汤",128,42,300],["招牌牛排",368,140,200],["主厨甜点",88,22,340],["红酒(杯)",98,38,520],["气泡水",48,12,480]],
    小吃:[["生煎包",18,5,1400],["小笼包",22,7,1100],["葱油拌面",16,4,900],["馄饨",15,5,760],["糖醋排骨",28,11,420],["豆浆",5,1,1600]],
    饮品:[["招牌奶茶",18,5,2200],["美式咖啡",16,3.5,1300],["拿铁",22,6,1500],["水果茶",24,7,980],["气泡美式",20,5,640],["小蛋糕",26,9,520]]
  };
  return (P[type]||P.快餐).map(d=>({name:d[0],price:d[1],cost:d[2],qty:d[3]}));
}
function seedRecords(type){
  const t=TYPES[type];const recs=[];const today=new Date();today.setHours(0,0,0,0);
  const dishes=seedDishes(type);const dailyBase=dishes.reduce((a,d)=>a+d.price*d.qty,0)/30;
  for(let i=89;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const dow=d.getDay();
    const wk=(dow===0||dow===6)?1.3:(dow===5?1.12:1);const trend=1+(89-i)/89*0.08,noise=0.9+Math.random()*0.2;
    const rev=Math.round(dailyBase*wk*trend*noise/10)*10;const traffic=Math.round(rev/t.seedAvg);
    const food=Math.round(rev*(t.bench.food[0]/100+0.02+Math.random()*0.02));
    const labor=Math.round(rev*(t.bench.labor[0]/100+0.02+Math.random()*0.02));
    const r={date:d.toISOString().slice(0,10),rev,traffic,food,labor};
    if(t.hasSpeed)r.speed=Math.round(t.bench.speed[1]*0.82+Math.random()*t.bench.speed[1]*0.3);
    if(t.hasExp)r.exp=Math.round(88+Math.random()*10);
    recs.push(r);}
  return recs;
}
function newStore(type){const t=TYPES[type];
  return {name:`我的${t.label}店`,type,area:type==='精致正餐'?260:type==='快餐'?120:160,
    seats:type==='精致正餐'?80:60,rent:type==='精致正餐'?60000:18000,fixedOther:0.06,
    dishes:seedDishes(type),records:seedRecords(type)};}
function seed(){
  return {activeStore:0,stores:[{
    name:"我的店", type:"快餐", area:120, seats:60, rent:18000, fixedOther:0.06,
    dishes:[], records:[]    // 空的，让用户自己录
  }]};
}
let DB=load();
function load(){try{const s=localStorage.getItem(DBK);if(s){const o=JSON.parse(s);if(o.stores&&o.stores[0].records.length)return o;}}catch(e){}const d=seed();localStorage.setItem(DBK,JSON.stringify(d));return d;}
function save(){localStorage.setItem(DBK,JSON.stringify(DB));}
function S(){return DB.stores[DB.activeStore];}
function TY(){return TYPES[S().type];}
function recsSorted(){return [...S().records].sort((a,b)=>a.date<b.date?-1:1);}
const fmt=n=>Math.round(n).toLocaleString();
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400);}

/* ---------- 计算引擎 ---------- */
function dayProfit(r){const s=S();return Math.round(r.rev-r.food-r.labor-r.rev*s.fixedOther-s.rent/30);}
function dishMetrics(){return (S().dishes||[]).map(d=>{const margin=d.price>0?(d.price-d.cost)/d.price*100:0;
  return {...d,margin:+margin.toFixed(1),profitEach:+(d.price-d.cost).toFixed(1),monthProfit:(d.price-d.cost)*d.qty,monthRev:d.price*d.qty};});}
function classifyDishes(){const dm=dishMetrics();if(!dm.length)return[];
  const ag=dm.reduce((a,d)=>a+d.margin,0)/dm.length,aq=dm.reduce((a,d)=>a+d.qty,0)/dm.length;
  return dm.map(d=>{const hg=d.margin>=ag,hq=d.qty>=aq;let cat,tag;
    if(hg&&hq){cat='明星菜';tag='jun';}else if(!hg&&hq){cat='走量菜';tag='chen';}
    else if(hg&&!hq){cat='潜力菜';tag='zuo';}else{cat='滞销菜';tag='shi';}
    return {...d,cat,tag,ag,aq};});}
function menuGrossMargin(){const dm=dishMetrics();if(!dm.length)return 0;
  const rev=dm.reduce((a,d)=>a+d.monthRev,0),pr=dm.reduce((a,d)=>a+d.monthProfit,0);return rev?+(pr/rev*100).toFixed(1):0;}
function aggregate(recs){if(!recs.length)return null;const s=S(),t=TYPES[s.type];
  const sum=k=>recs.reduce((a,r)=>a+(+r[k]||0),0);
  const rev=sum('rev'),food=sum('food'),labor=sum('labor'),traffic=sum('traffic');
  const profit=recs.reduce((a,r)=>a+dayProfit(r),0),days=recs.length;
  const other=rev*s.fixedOther,rent=s.rent/30*days;
  const foodP=rev?+(food/rev*100).toFixed(1):0,laborP=rev?+(labor/rev*100).toFixed(1):0;
  const rentP=rev?+(rent/rev*100).toFixed(1):0,otherP=rev?+(other/rev*100).toFixed(1):0;
  const prime=+(foodP+laborP).toFixed(1),netP=rev?+(profit/rev*100).toFixed(1):0;
  const totalCostP=+(foodP+laborP+rentP+otherP).toFixed(1);
  const avg=traffic?+(rev/traffic).toFixed(1):0,gross=rev?+((rev-food)/rev*100).toFixed(1):0;
  const m={rev,food,labor,other,rent,traffic,profit,days,foodP,laborP,rentP,otherP,prime,netP,totalCostP,avg,gross,t,type:s.type,b:t.bench};
  if(t.hasSpeed)m.speed=Math.round(recs.reduce((a,r)=>a+(r.speed||0),0)/days);
  if(t.hasExp)m.exp=Math.round(recs.reduce((a,r)=>a+(r.exp||0),0)/days);
  return m;}
function lastRecord(){const r=recsSorted();return r[r.length-1];}
function recordByDate(d){return S().records.find(r=>r.date===d);}
function findRelative(base,back){const d=new Date(base);d.setDate(d.getDate()-back);return recordByDate(d.toISOString().slice(0,10));}
function periodRecords(p){const recs=recsSorted();const last=recs[recs.length-1];if(!last)return[];
  const end=new Date(last.date);let start=new Date(end);
  start.setDate(end.getDate()-{day:0,week:6,month:29,quarter:89,year:364}[p]);
  const s0=start.toISOString().slice(0,10);return recs.filter(r=>r.date>=s0);}
function prevPeriodRecords(p){const recs=recsSorted();const last=recs[recs.length-1];if(!last)return[];
  const span={day:1,week:7,month:30,quarter:90,year:365}[p];const end=new Date(last.date);end.setDate(end.getDate()-span);
  const start=new Date(end);start.setDate(end.getDate()-span+1);
  const s0=start.toISOString().slice(0,10),e0=end.toISOString().slice(0,10);return recs.filter(r=>r.date>=s0&&r.date<=e0);}
function pctChange(c,b){if(!b)return null;return (c-b)/b*100;}

/* ===== 成本目标引擎 ===== */
function costTarget(m){
  const targetFoodP=Math.min(m.foodP,m.b.food[1]),targetLaborP=Math.min(m.laborP,m.b.labor[1]);
  const foodGap=Math.max(0,m.foodP-m.b.food[1]),laborGap=Math.max(0,m.laborP-m.b.labor[1]);
  const savePct=foodGap+laborGap,dailyRev=m.rev/m.days;
  const monthExtra=Math.round(dailyRev*30*savePct/100),targetNetP=+(m.netP+savePct).toFixed(1);
  return {targetFoodP,targetLaborP,foodGap:+foodGap.toFixed(1),laborGap:+laborGap.toFixed(1),
    savePct:+savePct.toFixed(1),monthExtra,targetNetP,
    targetFoodMoney:Math.round(dailyRev*30*targetFoodP/100),targetLaborMoney:Math.round(dailyRev*30*targetLaborP/100),
    curFoodMoney:Math.round(dailyRev*30*m.foodP/100),curLaborMoney:Math.round(dailyRev*30*m.laborP/100),
    onTrack:savePct<0.5&&m.totalCostP<=70};
}

/* =================================================================
   AI 接入：优先后端(真实 DeepSeek)，失败用内置引擎
   ================================================================= */
let AI_BACKEND=false;
async function checkBackend(){
  try{const r=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ping:1})});
    AI_BACKEND=r.ok; }catch(e){AI_BACKEND=false;}
  const el=document.getElementById('aiStatus');
  if(el)el.innerHTML=AI_BACKEND?'AI：已连接 DeepSeek ✓<br>真实大模型在线':'AI：本地模式<br>(启动后端可接 DeepSeek)';
}
// 调后端流式，回调每段文字；返回是否成功
async function streamFromBackend(url,payload,onChunk){
  try{
    const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!resp.ok||!resp.body)return false;
    const reader=resp.body.getReader();const dec=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;onChunk(dec.decode(value,{stream:true}));}
    return true;
  }catch(e){return false;}
}

let charts={};
function killCharts(){Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});charts={};}
const PAGES={};

/* ===== 今日利润 ===== */
function motivLine(){const last=lastRecord();const today=dayProfit(last);const y=findRelative(last.date,1);const yp=y?dayProfit(y):null;
  const m=aggregate(periodRecords('month'));
  if(yp!=null&&yp>0&&today>yp*1.1)return['🔥',`今日利润比昨日高 ${(((today-yp)/yp)*100).toFixed(0)}%，状态不错，继续保持。`];
  if(yp!=null&&yp>0&&today<yp*0.9)return['💪',`今日比昨日有所回落，看看是客流还是客单价的问题，明天补回来。`];
  return['📊',`今日净利润 ¥${fmt(today)}，本月累计 ¥${fmt(m.profit)}。`];}
function cmpBox(label,base){const today=dayProfit(lastRecord());
  if(base==null)return `<div class="cmp"><div class="ck">${label}</div><div class="cv flat">— 无数据</div></div>`;
  const ch=pctChange(today,base);const cls=ch>=0?'up':'down',a=ch>=0?'▲':'▼';
  return `<div class="cmp"><div class="ck">${label}</div><div class="cv ${cls}">${a} ${Math.abs(ch).toFixed(0)}% <span class="muted" style="font-weight:500">(¥${fmt(base)})</span></div></div>`;}

/* 没有数据时的友好欢迎页（新用户第一次打开）*/
function emptyState(title,desc){
  return `<div class="card" style="text-align:center;padding:50px 24px">
    <div style="font-size:46px;margin-bottom:12px">📝</div>
    <h3 style="justify-content:center;font-size:18px">${title}</h3>
    <div class="sub" style="margin:8px auto 20px;max-width:380px">${desc}</div>
    <button class="btn" onclick="goto('settings')">① 先填门店信息</button>
    <button class="btn" style="margin-left:10px" onclick="goto('entry')">② 录入今天的数据</button>
    <div class="note" style="margin-top:18px">填了第一笔数据后，这里就会显示你的利润、图表和 AI 诊断。</div>
  </div>`;
}

PAGES.home=()=>{
  if(!S().records.length)return emptyState('欢迎使用智餐经营 👋','还没有数据。先到「门店设置」填好你的店，再到「录入数据」记下今天的营业额和来客数，系统就会自动帮你算利润、出报告。');
  const last=lastRecord();const today=dayProfit(last);const m=aggregate(periodRecords('month'));const [mi,mt]=motivLine();
  setTimeout(()=>{renderMoneyFlow(last);renderProfitBars('homeBars');},80);
  return `
  <div class="profit-hero">
    <div class="ph-lbl">💰 今日净利润</div>
    <div class="ph-big">¥${fmt(today)}</div>
    <div class="ph-sub">${last.date} · 营业额 ¥${fmt(last.rev)} · 来客 ${last.traffic} 人 · 客单价 ¥${(last.rev/last.traffic).toFixed(1)}</div>
    <div class="ph-words">营业额 ¥${fmt(last.rev)}，扣除各项成本后，<b style="color:var(--gr)">净利润 ¥${fmt(today)}</b>。</div>
    <div class="cmprow">
      ${cmpBox('对比昨日',(f=>f?dayProfit(f):null)(findRelative(last.date,1)))}
      ${cmpBox('对比上周同日',(f=>f?dayProfit(f):null)(findRelative(last.date,7)))}
      ${cmpBox('对比上月同日',(f=>f?dayProfit(f):null)(findRelative(last.date,30)))}
    </div>
  </div>
  <div class="card"><h3>💡 利润构成</h3><div class="sub">营业额扣除各项成本，剩下的就是净利润</div><div class="flow" id="moneyFlow"></div></div>
  <div class="grid4">
    <div class="kpi"><div class="l">本月累计利润</div><div class="v" style="color:var(--gr)">¥${fmt(m.profit)}</div><div class="bench">${m.days} 天</div></div>
    <div class="kpi"><div class="l">本月营业额</div><div class="v">¥${fmt(m.rev)}</div><div class="bench">净利率 ${m.netP}%</div></div>
    <div class="kpi"><div class="l">毛利率</div><div class="v">${m.gross}%</div><div class="bench">目标 ≥${m.t.grossTarget}%</div></div>
    <div class="kpi"><div class="l">客单价</div><div class="v">¥${m.avg}</div><div class="bench">来客 ${fmt(m.traffic)}</div></div>
  </div>
  <div class="card"><h3>📈 本月每日利润</h3><div class="sub">绿色为高于平均的日子</div><canvas id="homeBars"></canvas></div>
  <div class="card" style="border-left:3px solid var(--gr)"><h3>${mi} AI 提醒</h3><div style="font-size:14.5px;color:#c8d3e4;line-height:1.6">${mt}</div></div>`;
};

/* ===== 录入数据 ===== */
PAGES.entry=()=>{const last=lastRecord();const t=TY();
  // 有数据就默认填下一天，没数据(新用户)就默认今天
  const nd=last?new Date(last.date):new Date();if(last)nd.setDate(nd.getDate()+1);
  setTimeout(()=>{document.getElementById('e_date').value=nd.toISOString().slice(0,10);},40);
  const recent=recsSorted().slice(-7).reverse();
  let extra='';
  if(t.hasSpeed)extra+=`<div class="field"><label>${t.speedName}（秒）</label><input id="e_speed" type="number" placeholder="${t.bench.speed[1]}"></div>`;
  if(t.hasExp)extra+=`<div class="field"><label>客户满意度（0-100，选填）</label><input id="e_exp" type="number" placeholder="92"></div>`;
  return `<div class="grid2">
    <div class="card"><h3>✍️ 录入今日数据</h3><div class="sub">每天打烊后录入，系统自动累积、自动核算利润。食材和人力成本可留空，系统按近期比例估算。</div>
      <div class="field"><label>日期</label><input id="e_date" type="date"></div>
      <div class="grid2">
        <div class="field"><label>营业额（元）</label><input id="e_rev" type="number" placeholder="8600"></div>
        <div class="field"><label>来客数（人）</label><input id="e_traf" type="number" placeholder="200"></div>
        <div class="field"><label>食材成本（元）</label><input id="e_food" type="number" placeholder="3100"></div>
        <div class="field"><label>人力成本（元）</label><input id="e_labor" type="number" placeholder="2100"></div>
        ${extra}
      </div>
      <button class="btn" onclick="addEntry()">保存</button>
    </div>
    <div class="card"><h3>最近 7 天</h3>
      <table><tr><th>日期</th><th>营业额</th><th>来客</th><th>利润</th></tr>
      ${recent.map(r=>`<tr><td>${r.date.slice(5)}</td><td>¥${fmt(r.rev)}</td><td>${r.traffic}</td><td style="color:${dayProfit(r)>=0?'var(--gr)':'var(--rd)'};font-weight:700">¥${fmt(dayProfit(r))}</td></tr>`).join('')}</table>
      <button class="btn ghost sm" style="margin-top:14px" onclick="if(confirm('恢复示范数据？')){localStorage.removeItem(DBK);DB=load();render();toast('已恢复示范数据');}">↺ 恢复示范数据</button>
    </div>
  </div>`;
};

/* ===== 经营报告 ===== */
let curPeriod='month';
PAGES.report=()=>{setTimeout(renderReport,60);
  return `<div class="segbar" id="segbar">
    ${['day','week','month','quarter','year'].map(p=>`<div class="seg ${p===curPeriod?'active':''}" data-p="${p}" onclick="curPeriod='${p}';renderReport();document.querySelectorAll('#segbar .seg').forEach(s=>s.classList.toggle('active',s.dataset.p==='${p}'))">${({day:'日报',week:'周报',month:'月报',quarter:'季报',year:'年报'})[p]}</div>`).join('')}
  </div><div id="reportBody"></div>`;
};
function renderReport(){const recs=periodRecords(curPeriod),prev=prevPeriodRecords(curPeriod);
  const m=aggregate(recs),pm=prev.length?aggregate(prev):null;
  if(!m){document.getElementById('reportBody').innerHTML=emptyState('还没有数据','录入几天的营业额后，这里会自动生成日报、周报、月报。');return;}
  const pl={day:'昨日',week:'上周',month:'上月',quarter:'上季',year:'去年'}[curPeriod];
  const ch=(c,b)=>{if(!b)return'';const v=pctChange(c,b);return `<span class="${v>=0?'up':'down'}" style="font-size:13px">${v>=0?'▲':'▼'}${Math.abs(v).toFixed(0)}%</span>`;};
  const kc=(l,v,c,s)=>`<div class="kpi"><div class="l">${l}</div><div class="v">${v} ${c}</div><div class="bench">${s}</div></div>`;
  const ct=costTarget(m);
  const rows=[reportRow('食材成本率',m.foodP,m.b.food,false),reportRow('人力成本率',m.laborP,m.b.labor,false),
    reportRow('主成本',m.prime,m.b.prime,false),reportRow('净利率',m.netP,m.b.net,true),reportRow('毛利率',m.gross,[m.t.grossTarget,100],true)];
  if(m.t.hasSpeed)rows.push(reportRow(m.t.speedName,m.speed,m.b.speed,false,'秒'));
  if(m.exp!=null)rows.push(reportRow('客户满意度',m.exp,m.b.exp,true));
  setTimeout(()=>{renderReportTrend('rpTrend',recs);renderCostDonut('rpCost',m);},60);
  document.getElementById('reportBody').innerHTML=`
  <div class="grid4">
    ${kc('营业额','¥'+fmt(m.rev),pm?ch(m.rev,pm.rev):'',`对比${pl}`)}
    ${kc('净利润','¥'+fmt(m.profit),pm?ch(m.profit,pm.profit):'',`净利率 ${m.netP}%`)}
    ${kc('来客数',fmt(m.traffic),pm?ch(m.traffic,pm.traffic):'',`客单价 ¥${m.avg}`)}
    ${kc('日均营业额','¥'+fmt(m.rev/m.days),'',`${m.days} 天`)}
  </div>
  <div class="grid2">
    <div class="card"><h3>📈 营业额与利润趋势</h3><canvas id="rpTrend"></canvas></div>
    <div class="card"><h3>🥧 成本结构</h3><div class="sub">主成本 ${m.prime}%（生死线 ≤${m.b.prime[1]}%）</div><canvas id="rpCost"></canvas></div>
  </div>
  ${costTargetCard(m,ct)}`;
}
function costTargetCard(m,ct){
  if(ct.onTrack)return `<div class="card" style="border-left:3px solid var(--gr)"><h3>🎯 成本目标</h3>
    <div style="font-size:15px;line-height:1.7;color:#c8d3e4">成本控制良好：食材成本率 ${m.foodP}%、人力成本率 ${m.laborP}%，均在健康区间，净利率 ${m.netP}%。接下来把重心放在提升营业额和客单价上。</div></div>`;
  return `<div class="card" style="border-left:3px solid var(--yl)"><h3>🎯 成本目标：达标后每月多赚 ¥${fmt(ct.monthExtra)}</h3>
    <div class="sub">成本偏高，正在侵蚀利润。下面是建议的成本目标。</div>
    <table><tr><th>成本项</th><th>当前</th><th>目标</th><th>每月可省</th></tr>
      ${ct.foodGap>0.3?`<tr><td>食材成本</td><td>${m.foodP}%（¥${fmt(ct.curFoodMoney)}）</td><td style="color:var(--gr)">${ct.targetFoodP}%（¥${fmt(ct.targetFoodMoney)}）</td><td><b style="color:var(--gr)">¥${fmt(ct.curFoodMoney-ct.targetFoodMoney)}</b></td></tr>`:''}
      ${ct.laborGap>0.3?`<tr><td>人力成本</td><td>${m.laborP}%（¥${fmt(ct.curLaborMoney)}）</td><td style="color:var(--gr)">${ct.targetLaborP}%（¥${fmt(ct.targetLaborMoney)}）</td><td><b style="color:var(--gr)">¥${fmt(ct.curLaborMoney-ct.targetLaborMoney)}</b></td></tr>`:''}
    </table>
    <div style="margin-top:14px;padding:14px;background:#10241a;border:1px solid #1d4d36;border-radius:12px;font-size:14px;color:#c8d3e4;line-height:1.7">
      主成本（食材+人力）建议控制在 <b style="color:var(--gr)">${m.b.prime[1]}%</b> 以内（当前 ${m.prime}%）；总成本建议控制在 <b style="color:var(--gr)">70%</b> 以内（当前 ${m.totalCostP}%）。
      达标后净利率可从 ${m.netP}% 提升到 <b style="color:var(--gr)">${ct.targetNetP}%</b>，每月多赚约 <b style="color:var(--gr)">¥${fmt(ct.monthExtra)}</b>。</div>
    <div class="note">降本方向：食材货比三家/集中采购、按客流排班、控制损耗。详细可问「AI 顾问」。</div></div>`;
}
function reportRow(name,raw,range,higherBetter,unit){
  unit=unit||(name.includes('率')?'%':'');
  let c;if(name.includes('速度')){c=raw<=range[1]?'g':raw<=range[1]*1.15?'y':'r';}
  else if(higherBetter)c=raw>=range[1]?'g':raw>=range[0]?'y':'r';
  else c=raw<=range[0]?'g':raw<=range[1]?'y':'r';
  const st=c==='g'?'健康':c==='y'?'注意':'超标';
  const rs=name.includes('速度')?'≤'+range[1]+'秒':range[0]+'–'+range[1]+unit;
  return `<tr><td>${name}</td><td><b>${raw}${unit}</b></td><td>${rs}</td><td><span class="dot ${c}"></span> ${st}</td></tr>`;
}

/* ===== 菜品利润 ===== */
PAGES.dishes=()=>{setTimeout(()=>{renderDishesPage();renderDishQuad('dishQuad');},60);
  return `<div class="card"><h3>🍽️ 菜品利润分析</h3>
    <div class="sub">编辑每道菜的售价和成本，实时显示毛利率与利润贡献。卖得好但毛利低的可适当提价，毛利低又滞销的可考虑下架。</div>
    <div id="dishWrap"></div>
    <button class="btn sm" style="margin-top:12px" onclick="addDish()">+ 添加菜品</button>
    <button class="btn ghost sm" style="margin-top:12px;margin-left:8px" onclick="saveDishes()">💾 保存</button></div>
  <div class="grid2">
    <div class="card"><h3>📊 菜品矩阵</h3><div class="sub">毛利率 × 销量。右上为优质菜品，左下需处理</div><canvas id="dishQuad"></canvas></div>
    <div class="card"><h3>💡 调整建议</h3><div id="dishAdvice"></div></div></div>`;
};
function renderDishesPage(){const dm=dishMetrics();const cls=classifyDishes();const rm={};cls.forEach(c=>rm[c.name]=c);
  document.getElementById('dishWrap').innerHTML=`
    <table><tr><th>菜品</th><th>售价</th><th>成本</th><th>毛利率</th><th>月销量</th><th>月利润贡献</th><th>类型</th><th></th></tr>
    ${dm.map((d,i)=>{const c=rm[d.name];return `<tr><td>${d.name}</td>
      <td><input class="editnum" type="number" value="${d.price}" onchange="updateDish(${i},'price',this.value)"></td>
      <td><input class="editnum" type="number" value="${d.cost}" onchange="updateDish(${i},'cost',this.value)"></td>
      <td><b style="color:${d.margin>=60?'var(--gr)':d.margin>=45?'var(--yl)':'var(--rd)'}">${d.margin}%</b></td>
      <td><input class="editnum" type="number" value="${d.qty}" onchange="updateDish(${i},'qty',this.value)"></td>
      <td><b>¥${fmt(d.monthProfit)}</b></td><td><span class="tag ${c.tag}">${c.cat}</span></td>
      <td><button class="btn ghost sm" onclick="delDish(${i})">删</button></td></tr>`;}).join('')}
    <tr style="border-top:2px solid var(--bd2)"><td><b>合计</b></td><td></td><td></td><td><b style="color:var(--br2)">${menuGrossMargin()}%</b></td>
      <td><b>${fmt(dm.reduce((a,d)=>a+d.qty,0))}</b></td><td><b style="color:var(--gr)">¥${fmt(dm.reduce((a,d)=>a+d.monthProfit,0))}</b></td><td></td><td></td></tr></table>
    <div class="note">整店加权毛利率 ${menuGrossMargin()}%（目标 ≥${TY().grossTarget}%）。修改价格可实时看合计利润变化。</div>`;
  const adv={明星菜:'高毛利高销量，放菜单首位重点推荐，是利润支柱',走量菜:'销量高但毛利低，可小幅提价或降本，因销量大效果放大',潜力菜:'毛利高但销量低，加强推荐、改名换图把它卖动',滞销菜:'毛利低又滞销，考虑下架或重新设计，节省备料与库存'};
  const g={};cls.forEach(c=>{(g[c.cat]=g[c.cat]||[]).push(c.name);});
  document.getElementById('dishAdvice').innerHTML=Object.entries(g).map(([cat,ns])=>{const tag={明星菜:'jun',走量菜:'chen',潜力菜:'zuo',滞销菜:'shi'}[cat];
    return `<div style="margin-bottom:13px"><span class="tag ${tag}">${cat}</span> <span class="muted">${ns.join('、')}</span><div style="font-size:13.5px;color:#c8d3e4;margin-top:5px;line-height:1.5">${adv[cat]}</div></div>`;}).join('');
}

/* ===== AI 诊断（真实后端 + 兜底）===== */
PAGES.ai=()=>{const m=aggregate(periodRecords('month'));
  if(!m)return emptyState('还没有数据','录入几天的经营数据后，AI 才能帮你诊断。先去「录入数据」。');
  setTimeout(()=>runDiagnose(m),100);
  return `<div class="aihero"><div class="ai-head"><div class="ai-av">🤖</div><div><div class="ai-nm">AI 餐饮顾问 · 经营诊断</div><div class="ai-mt" id="aiMeta">分析中…</div></div></div>
    <div class="ai-stream" id="aiStream"></div><div class="chips" id="aiChips"></div></div><div id="aiReport"></div>`;
};
async function runDiagnose(m){
  const el=document.getElementById('aiStream');const meta=document.getElementById('aiMeta');
  el.innerHTML='<span class="cursor"></span>';
  const payload=aiPayload(m);
  let got=false;
  const ok=await streamFromBackend('/api/diagnose',payload,(txt)=>{got=true;el.innerHTML=(el.dataset.t=(el.dataset.t||'')+txt)+'<span class="cursor"></span>';});
  if(ok&&got){el.innerHTML=el.dataset.t;meta.textContent='DeepSeek 实时生成 · 基于近 30 天数据';}
  else{ // 兜底：内置引擎
    el.dataset.t='';streamLocal(el,diagTokens(m),()=>{document.getElementById('aiReport').innerHTML=aiReportCards(m);});
    meta.textContent='本地模式 · 启动后端可接 DeepSeek';
  }
  document.getElementById('aiChips').innerHTML=['怎么降成本？','哪道菜该提价？','如何提升客单价？'].map(c=>`<span class="chip" onclick="goto('chat');setTimeout(()=>askPreset(\`${c}\`),250)">💬 ${c}</span>`).join('');
  if(ok&&got)document.getElementById('aiReport').innerHTML=aiReportCards(m);
}
// 给 AI 的结构化数据
function aiPayload(m){return {业态:m.t.label,营业额:m.rev,净利润:m.profit,净利率:m.netP+'%',毛利率:m.gross+'%',
  食材成本率:m.foodP+'%',人力成本率:m.laborP+'%',主成本:m.prime+'%',总成本:m.totalCostP+'%',客单价:m.avg,
  来客数:m.traffic,天数:m.days,出餐速度:m.speed?m.speed+'秒':'不适用',
  菜品:classifyDishes().map(d=>({菜名:d.name,毛利率:d.margin+'%',月销量:d.qty,类型:d.cat}))};}
function diagTokens(m){const t=[];const push=(s,tag)=>t.push({s,tag});const ct=costTarget(m);
  push('结论：本月营业额 ');push('¥'+fmt(m.rev),'b');push('，净利润 ');push('¥'+fmt(m.profit),'b');push('，净利率 '+m.netP+'%。');
  if(ct.monthExtra>500){push('主要问题在成本——');push('偏高','hl');push('。食材成本率 '+m.foodP+'%、人力成本率 '+m.laborP+'%。');
    push('降到健康水平，');push('每月可多赚 ¥'+fmt(ct.monthExtra),'hl');push('。');}
  else push('成本控制良好，重心应放在提升营业额和客单价上。','hl');
  return t;}
function aiReportCards(m){const out=[];const ct=costTarget(m);const cls=classifyDishes();
  if(ct.monthExtra>500)out.push(['yl','💰','成本偏高，正在侵蚀利润',
    `食材成本率 ${m.foodP}%、人力成本率 ${m.laborP}%，主成本 ${m.prime}%，超过生死线 ${m.b.prime[1]}%。`,
    `降到健康水平，<b>每月可多赚 ¥${fmt(ct.monthExtra)}</b>。降本方向：食材货比三家/集中采购、按客流排班、控制损耗。`]);
  else out.push(['gr','✅','成本结构健康',`净利率 ${m.netP}%、主成本 ${m.prime}%。`,`重心转向增长：提升营业额、客单价与复购。`]);
  const dogs=cls.filter(d=>d.cat==='滞销菜');
  if(dogs.length)out.push(['yl','🍽️','部分菜品滞销',`${dogs.slice(0,3).map(d=>d.name).join('、')} 毛利低且销量低。`,`考虑下架或重新设计，详见「菜品利润」。`]);
  if(m.t.hasSpeed&&m.speed>m.b.speed[1])out.push(['yl','⏱️',m.t.speedName+'偏慢',`平均 ${m.speed} 秒，超过 ${m.b.speed[1]} 秒目标。`,`优化后厨动线、提前备料、高峰增援。`]);
  return out.map(o=>`<div class="card" style="border-left:3px solid var(--${o[0]==='yl'?'yl':o[0]==='rd'?'rd':'gr'})">
    <h3>${o[1]} ${o[2]}</h3><div class="muted" style="line-height:1.65;margin:6px 0">${o[3]}</div>
    <div style="background:var(--panel2);padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.65"><b style="color:var(--br2)">建议 ｜ </b>${o[4]}</div></div>`).join('');}

/* ===== AI 顾问对话（真实后端 + 兜底）===== */
PAGES.chat=()=>{setTimeout(initChat,60);
  return `<div class="card"><h3>💬 AI 餐饮顾问</h3><div class="sub">结合你这家${TY().label}的真实数据回答，直接给出可执行建议。</div>
    <div class="chatbox" id="chatbox"></div><div class="chips" id="chatChips"></div>
    <div class="chat-input"><input id="chatIn" placeholder="例如：如何提升利润？" onkeydown="if(event.key==='Enter')sendChat()"><button class="btn" onclick="sendChat()">发送</button></div></div>`;
};
function pushMsg(t,who){const box=document.getElementById('chatbox');const d=document.createElement('div');d.className='msg '+who;d.innerHTML=t;box.appendChild(d);box.scrollTop=box.scrollHeight;return d;}
async function aiReplyChat(q){const m=aggregate(periodRecords('month'));const d=pushMsg('<span class="cursor"></span>','a');
  const payload={question:q,store:aiPayload(m)};let buf='';let got=false;
  const ok=await streamFromBackend('/api/chat',payload,(txt)=>{got=true;buf+=txt;d.innerHTML=buf+'<span class="cursor"></span>';
    d.parentElement.scrollTop=d.parentElement.scrollHeight;});
  if(ok&&got){d.innerHTML=buf;}
  else{const ans=aiExpertLocal(q,m);let i=0;(function step(){i+=4;if(i>=ans.length){d.innerHTML=ans;return;}d.innerHTML=ans.slice(0,i).replace(/<[^>]*$/,'')+'<span class="cursor"></span>';setTimeout(step,15);})();}
}
function aiExpertLocal(q,m){const ct=costTarget(m);const cls=classifyDishes();
  if(/降成本|成本|省钱|降低/.test(q)){if(ct.monthExtra<500)return `成本控制已较好，食材 ${m.foodP}%、人力 ${m.laborP}% 都在健康区间，重心可转向增长。`;
    return `成本偏高。目标：食材成本率从 ${m.foodP}% 降到 ${ct.targetFoodP}%，人力从 ${m.laborP}% 降到 ${ct.targetLaborP}%，<b>每月多赚 ¥${fmt(ct.monthExtra)}</b>。方法：食材货比三家/集中采购、按客流排班、控制损耗。`;}
  if(/提价|涨价|哪道菜|菜|下架/.test(q)){const plow=cls.filter(d=>d.cat==='走量菜'),dog=cls.filter(d=>d.cat==='滞销菜');
    return `<b>可提价</b>：${plow.slice(0,2).map(d=>d.name).join('、')||'走量菜'}，销量高毛利低，小幅提价 1-2 元，量大见效快。<b>可下架</b>：${dog.slice(0,2).map(d=>d.name).join('、')||'滞销菜'}。详见「菜品利润」。`;}
  if(/客单价|客单|连带|套餐/.test(q))return `客单价 ¥${m.avg}。① 设计套餐与加配引导连带；② 高毛利明星菜放显眼位置；③ 收银主动推荐。客单价提升 ¥${Math.max(2,Math.round(m.avg*0.1))}，月增营收约 ¥${fmt(m.traffic/m.days*30*Math.max(2,Math.round(m.avg*0.1)))}。`;
  if(/利润|多赚|赚钱|净利/.test(q))return `本月净利润 ¥${fmt(m.profit)}，净利率 ${m.netP}%。提升路径：${ct.monthExtra>500?'先降成本（每月可多赚 ¥'+fmt(ct.monthExtra)+'）':'提升客单价、推广明星菜'}。`;
  if(/生意|怎么样|总结|本月/.test(q))return `本月营业额 ¥${fmt(m.rev)}，净利润 ¥${fmt(m.profit)}，来客 ${fmt(m.traffic)}，客单价 ¥${m.avg}，毛利率 ${m.gross}%。${m.netP>=m.b.net[0]?'整体健康。':'净利偏低，主要在成本。'}`;
  return `本月营业额 ¥${fmt(m.rev)}，净利润 ¥${fmt(m.profit)}，客单价 ¥${m.avg}。关于"${q}"，可具体问我成本、菜品提价、客单价、利润方面的问题。`;
}
function sendChat(){const inp=document.getElementById('chatIn');const q=inp.value.trim();if(!q)return;pushMsg(q,'u');inp.value='';aiReplyChat(q);}
function askPreset(q){pushMsg(q,'u');aiReplyChat(q);}
function initChat(){const m=aggregate(periodRecords('month'));const box=document.getElementById('chatbox');box.innerHTML='';
  if(!m){pushMsg(`你好，我是你的 AI 餐饮顾问。你还没录入数据，先到「录入数据」记几天的营业额，我就能结合你的真实情况给建议了。`,'a');
    document.getElementById('chatChips').innerHTML='';return;}
  pushMsg(`你好，我是你的 AI 餐饮顾问。我已了解 <b>${S().name}</b>（${m.t.label}）近 30 天数据，净利率 ${m.netP}%。有什么经营问题，请直接问我。`,'a');
  document.getElementById('chatChips').innerHTML=['本月经营情况如何？','如何提升利润？','怎么降成本？','哪道菜该提价？'].map(c=>`<span class="chip" onclick="askPreset(\`${c}\`)">${c}</span>`).join('');}

/* ===== 历史 & 设置 ===== */
PAGES.history=()=>{const recs=recsSorted().reverse();const t=TY();
  return `<div class="card"><h3>🗂️ 历史数据（${recs.length} 天）</h3><div class="sub">数据持久保存在本地。</div>
    <table><tr><th>日期</th><th>营业额</th><th>来客</th><th>客单价</th><th>食材</th><th>人力</th><th>利润</th><th></th></tr>
    ${recs.slice(0,60).map(r=>`<tr><td>${r.date}</td><td>¥${fmt(r.rev)}</td><td>${r.traffic}</td><td>¥${(r.rev/r.traffic).toFixed(0)}</td><td>¥${fmt(r.food)}</td><td>¥${fmt(r.labor)}</td><td style="color:${dayProfit(r)>=0?'var(--gr)':'var(--rd)'};font-weight:700">¥${fmt(dayProfit(r))}</td><td><button class="btn ghost sm" onclick="delRec('${r.date}')">删</button></td></tr>`).join('')}</table></div>`;
};
PAGES.settings=()=>{const s=S();
  return `<div class="card" style="max-width:560px"><h3>⚙️ 门店设置</h3><div class="sub">业态决定使用哪套评估标准。</div>
    <div class="field"><label>门店名称</label><input id="s_name" value="${s.name}"></div>
    <div class="field"><label>业态</label><select id="s_type">${Object.keys(TYPES).map(k=>`<option value="${k}" ${s.type===k?'selected':''}>${TYPES[k].label}</option>`).join('')}</select></div>
    <div class="grid2"><div class="field"><label>营业面积（㎡）</label><input id="s_area" type="number" value="${s.area}"></div>
    <div class="field"><label>座位数</label><input id="s_seats" type="number" value="${s.seats}"></div></div>
    <div class="grid2"><div class="field"><label>月房租（元）</label><input id="s_rent" type="number" value="${s.rent}"></div>
    <div class="field"><label>水电杂费占营业额比例（如0.06）</label><input id="s_other" type="number" step="0.01" value="${s.fixedOther}"></div></div>
    <button class="btn" onclick="saveStore()">保存</button>
    <button class="btn ghost sm" style="margin-left:8px" onclick="switchType()">⟳ 切换业态并重置示范数据</button></div>`;
};

/* ===== 操作 ===== */
function addEntry(){const t=TY();const date=document.getElementById('e_date').value;
  const rev=+document.getElementById('e_rev').value,traffic=+document.getElementById('e_traf').value;
  if(!date||!rev||!traffic){toast('请填写日期、营业额和来客数');return;}
  const food=+document.getElementById('e_food').value||Math.round(rev*(t.bench.food[0]/100+0.03));
  const labor=+document.getElementById('e_labor').value||Math.round(rev*(t.bench.labor[0]/100+0.03));
  const rec={date,rev,traffic,food,labor};
  if(t.hasSpeed)rec.speed=+document.getElementById('e_speed').value||t.bench.speed[1];
  if(t.hasExp&&document.getElementById('e_exp'))rec.exp=+document.getElementById('e_exp').value||90;
  const recs=S().records;const idx=recs.findIndex(r=>r.date===date);if(idx>=0)recs[idx]=rec;else recs.push(rec);
  save();toast('已保存，数据已更新');setTimeout(()=>goto('home'),500);}
function delRec(d){S().records=S().records.filter(r=>r.date!==d);save();render();toast('已删除');}
function updateDish(i,f,v){S().dishes[i][f]=+v;renderDishesPage();renderDishQuad('dishQuad');}
function delDish(i){S().dishes.splice(i,1);save();renderDishesPage();renderDishQuad('dishQuad');toast('已删除');}
function addDish(){S().dishes.push({name:'新菜品',price:20,cost:7,qty:300});save();renderDishesPage();renderDishQuad('dishQuad');}
function saveDishes(){save();toast('已保存');}
function saveStore(){const s=S();s.name=document.getElementById('s_name').value;const nt=document.getElementById('s_type').value;const ch=nt!==s.type;s.type=nt;
  s.area=+document.getElementById('s_area').value;s.seats=+document.getElementById('s_seats').value;
  s.rent=+document.getElementById('s_rent').value;s.fixedOther=+document.getElementById('s_other').value;
  save();updateTypeTag();toast(ch?'业态已切换':'已保存');render();}
function switchType(){const s=S();const ns=newStore(s.type);ns.name=s.name;ns.area=s.area;ns.seats=s.seats;ns.rent=s.rent;
  DB.stores[DB.activeStore]=ns;save();updateTypeTag();toast('已按 '+TYPES[s.type].label+' 重置');render();}
function updateTypeTag(){const t=TY();const el=document.getElementById('typeTag');if(el)el.innerHTML=`<span class="logo">${t.icon}</span><span>${t.label}</span>`;}

/* ===== 利润构成可视化 ===== */
function renderMoneyFlow(r){const el=document.getElementById('moneyFlow');if(!el)return;const s=S();
  const food=r.food,labor=r.labor,rent=Math.round(s.rent/30),other=Math.round(r.rev*s.fixedOther),profit=dayProfit(r),max=r.rev;
  const W=p=>Math.max(8,Math.round(p/max*100));
  const row=(color,label,money,tip)=>`<div class="flowrow"><div class="bar" style="width:${W(money)}%;background:${color}">¥${fmt(money)}</div><div class="tip">${label} ${tip}</div></div>`;
  el.innerHTML=
    row('linear-gradient(90deg,#fff,#cfe3ff)','营业额',r.rev,'')+
    row('var(--food)','食材成本',food,'')+
    row('var(--labor)','人力成本',labor,'')+
    row('var(--rent)','房租',rent,'(摊到今日)')+
    row('var(--other)','水电杂费',other,'')+
    `<div class="flow-final"><span class="fb">🎉</span><span class="ft">净利润</span><span class="fv">¥${fmt(profit)}</span></div>`;
}
/* ===== 图表 ===== */
const AX={x:{ticks:{color:'#5a6a85',maxTicksLimit:10},grid:{color:'#15203360'}},y:{ticks:{color:'#5a6a85'},grid:{color:'#15203360'}}};
function renderProfitBars(id){const el=document.getElementById(id);if(!el)return;const r=recsSorted().slice(-30);
  const goal=r.reduce((a,x)=>a+dayProfit(x),0)/r.length;
  charts[id]=new Chart(el,{type:'bar',data:{labels:r.map(x=>x.date.slice(5)),datasets:[{data:r.map(dayProfit),backgroundColor:r.map(x=>dayProfit(x)>=goal?'#34e0a1':'#ff7a3d'),borderRadius:5}]},options:{plugins:{legend:{display:false}},scales:AX}});}
function renderReportTrend(id,recs){const el=document.getElementById(id);if(!el)return;
  charts[id]=new Chart(el,{type:'line',data:{labels:recs.map(r=>r.date.slice(5)),datasets:[
    {label:'营业额',data:recs.map(r=>r.rev),borderColor:'#ff7a3d',backgroundColor:'rgba(255,122,61,.08)',fill:true,tension:.34,pointRadius:0},
    {label:'利润',data:recs.map(dayProfit),borderColor:'#34e0a1',tension:.34,pointRadius:0}]},options:{plugins:{legend:{labels:{color:'#9fb0cc'}}},scales:AX}});}
function renderCostDonut(id,m){const el=document.getElementById(id);if(!el)return;const other=Math.max(0,100-m.foodP-m.laborP-m.rentP-m.netP);
  charts[id]=new Chart(el,{type:'doughnut',data:{labels:['食材','人力','房租','水电杂费','净利润'],datasets:[{data:[m.foodP,m.laborP,m.rentP,+other.toFixed(1),m.netP],backgroundColor:['#ff6b7a','#ffce4a','#5eb3ff','#8595b0','#34e0a1'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom',labels:{color:'#aebbd2',font:{size:12},padding:13}}}}});}
function renderDishQuad(id){const el=document.getElementById(id);if(!el)return;const cls=classifyDishes();
  const col={明星菜:'#ffd166',走量菜:'#34e0a1',潜力菜:'#ffce4a',滞销菜:'#ff6b7a'};
  charts[id]=new Chart(el,{type:'bubble',data:{datasets:cls.map(d=>({label:d.name,data:[{x:d.qty,y:d.margin,r:Math.max(7,Math.sqrt(d.qty)/3)}],backgroundColor:col[d.cat]+'cc'}))},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const d=cls[c.datasetIndex];return `${d.name}: 毛利${d.margin}%, 月销${d.qty}`;}}}},
    scales:{x:{title:{display:true,text:'销量 →',color:'#8595b0'},ticks:{color:'#5a6a85'},grid:{color:'#15203360'}},y:{title:{display:true,text:'毛利率 ↑',color:'#8595b0'},ticks:{color:'#5a6a85'},grid:{color:'#15203360'}}}}});}

/* ===== 本地流式打字（兜底用）===== */
let typer=null;
function streamLocal(el,tokens,done){if(typer)clearTimeout(typer);
  let cs=[];tokens.forEach(p=>{for(let i=0;i<p.s.length;i++)cs.push({c:p.s[i],t:p.tag});});
  let idx=0,html='';(function step(){if(idx>=cs.length){el.innerHTML=html;if(done)done();return;}
    const x=cs[idx];const seg=x.t==='b'?`<b>${x.c}</b>`:x.t==='hl'?`<span class="hl">${x.c}</span>`:x.c;
    html+=seg;el.innerHTML=html+'<span class="cursor"></span>';idx++;typer=setTimeout(step,x.c.trim()===''?8:16);})();}

/* ===== 路由 ===== */
let curP='home';
function render(){goto(curP);}
function goto(p){curP=p;killCharts();
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.p===p));
  const T={home:'今日利润',entry:'录入数据',report:'经营报告',dishes:'菜品利润',ai:'AI 诊断',chat:'AI 顾问',history:'历史数据',settings:'门店设置'};
  const D={home:'今日真实净利润与对比',entry:'每日录入，自动累积核算',report:'日/周/月/季/年自动生成',dishes:'每道菜的成本利润与调整建议',ai:'AI 诊断经营状况并给建议',chat:'随时咨询 AI 餐饮顾问',history:'全部历史数据',settings:'门店与业态设置'};
  document.getElementById('main').innerHTML=`<div class="phead"><div><h1>${T[p]}</h1><div class="d">${D[p]}</div></div><div><select class="sel"><option>${S().name}</option></select></div></div><div id="body"></div>`;
  document.getElementById('body').innerHTML=PAGES[p]();
}
document.getElementById('nav').addEventListener('click',e=>{const a=e.target.closest('a');if(a)goto(a.dataset.p);});
updateTypeTag();goto('home');checkBackend();
