const DEMO=true; // set to false to hide the 'Test scan' button on live client sites

const $=s=>document.querySelector(s),v=i=>($('#'+i)||{}).value||'';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sv_=(p,f)=>`<svg viewBox="0 0 24 24" fill="${f?'currentColor':'none'}" stroke="${f?'none':'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC={ig:sv_('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>'),fb:sv_('<path d="M13.5 21v-7.5H16l.5-3h-3V8.8c0-.9.3-1.5 1.6-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.3 0-3.9 1.4-3.9 4v2H7.5v3H10V21z"/>',1),wa:sv_('<path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8z"/><path d="M9.2 8.6c-.3.6-.2 1.6.7 2.9s2 2.1 3.2 2.5c.7.2 1.5-.1 1.8-.8l-1.6-.9-.7.6c-.9-.4-1.6-1.1-2-2l.6-.7z"/>'),web:sv_('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/>'),chk:sv_('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),eye:sv_('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),off:sv_('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.7A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>')};
const DEF=window.CLIENT;
const PRE={cafe:DEF,rest:{...DEF,name:'Saffron Table',emoji:'',color:'#b3261e',tagline:'Dine often. Eat free.',need:6,reward:'Free dessert',cooldown:1,cdUnit:'h',sat:'4',sOffer:'Free starter on your next visit',wOffer:'Complimentary welcome drink',bOffer:'Free dessert on your birthday'}};
let S=null;try{S=JSON.parse(localStorage.getItem('lk'))}catch(e){}
if(!S||!S.cfg)S={cfg:{...DEF},users:[]};if(S.v!==DEF.version){S.cfg={...DEF};S.v=DEF.version}S.cfg={...DEF,...S.cfg};
const save=()=>{try{localStorage.setItem('lk',JSON.stringify(S))}catch(e){}};
const getS=()=>{try{return localStorage.getItem('lks')||sessionStorage.getItem('lks')}catch(e){return null}};
const setS=(p,rm)=>{try{localStorage.removeItem('lks');sessionStorage.removeItem('lks');p&&(rm?localStorage:sessionStorage).setItem('lks',p)}catch(e){}};
let mode='c',tab='o',isAdm=false,aTab='o',anim=-1,form='new',reward=null,q='',sur=null,pend=null;
const toast=m=>{$('#t').innerHTML='<div class="toast">'+esc(m)+'</div>';setTimeout(()=>$('#t').innerHTML='',2800)};
async function h(s){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('lk'+s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return 'p'+btoa(s)}}
const me=()=>{const p=getS();return S.users.find(u=>u.phone===p)};
const fd=t=>t?new Date(t).toLocaleDateString():'—';
function mark(){const c=S.cfg;return c.logo?`<img src="${esc(c.logo)}" alt="">`:esc((c.emoji||c.name.trim().slice(0,1)).toUpperCase())}
function socials(){const c=S.cfg,L=[['Instagram',c.ig,'ig'],['Facebook',c.fb,'fb'],['WhatsApp',c.wa,'wa'],['Website',c.web,'web']].filter(x=>/^https?:\/\//.test(x[1]));return L.length?`<div class="soc">${L.map(x=>`<a href="${esc(x[1])}" target="_blank" rel="noopener" aria-label="${x[0]}">${IC[x[2]]}</a>`).join('')}</div>`:''}
function head(){const c=S.cfg;return `<div class="bh"><div class="logo">${mark()}</div><h1>${esc(c.name)}</h1><p>${esc(c.tagline)}</p></div>`}
function render(){
 document.documentElement.style.setProperty('--brand',S.cfg.color);document.title=S.cfg.name+' Rewards';
 $('#mc').className=mode=='c'?'on':'';$('#ma').className=mode=='a'?'on':'';
 const m=$('#app');m.className=mode=='a'&&isAdm?'wide':'';
 m.innerHTML=mode=='c'?cust():adm();
 if(anim>=0){setTimeout(()=>anim=-1,900)}if(mode=='a'&&isAdm&&aTab=='q')drawQR();
}
function cust(){
 const c=S.cfg,u=me();let o=head();
 if(!u){const nw=form=='new';return o+`<div class="card"><div class="tabs"><button class="${nw?'on':''}" onclick="form='new';render()">New member</button><button class="${nw?'':'on'}" onclick="form='in';render()">Sign in</button></div>
 <h2>${nw?'Join the rewards club':'Welcome back'}</h2><p class="sub">${pend?'Sign in to collect your stamp.':nw?'Create your card in under a minute. Your first stamp is on us.':'Enter your details to open your card.'}</p>
 ${nw?'<label class="lb">Full name</label><input id="n" autocomplete="name">':''}
 <label class="lb">Phone number</label><input id="p" type="tel" autocomplete="tel">
 <label class="lb">Password</label><div class="pw"><input id="w" type="password" autocomplete="${nw?'new-password':'current-password'}"><button type="button" class="eye" aria-label="Show or hide password" onclick="tp('w',this)">${IC.eye}</button></div>
 ${nw?`<label class="lb">Birthday <span>(optional)</span></label><input id="b" type="date"><p class="hint">Choose your birthday to receive a special offer every year.</p><label class="chk"><input type="checkbox" id="cons"><span>I agree to receive offers and to ${esc(c.name)} storing my details.</span></label>`:''}
 <label class="chk"><input type="checkbox" id="rm" checked><span>Keep me signed in on this phone</span></label>
 <button class="btn" onclick="${nw?'reg()':'login()'}">${nw?'Join and get my first stamp':'Sign in'}</button></div>`+socials()}
 bdCheck(u);
 const need=+c.need,s=u.stamps,ready=s>=need,of=u.offers||[],av=of.filter(x=>!x.used&&!isExp(x));
 let g='';for(let i=0;i<need;i++)g+=i<s?`<div class="st f ${i==anim?'pop':''}">${IC.chk}</div>`:`<div class="st">${i+1}</div>`;
 o+=`<div class="card"><div class="eyebrow">Hello, ${esc(u.name.split(' ')[0])}</div><div class="count"><b>${Math.min(s,need)}</b><span>of ${need} stamps</span></div><div class="prog"><i style="width:${Math.min(100,s/need*100)}%"></i></div><div class="grid">${g}</div>
 <p class="rule">Collect ${need} stamps to earn <b>${esc(c.reward)}</b>.</p>`;
 if(sur)o+=`<div class="rw"><small>${esc(sur.t)}</small><b>${esc(sur.x)}</b><span class="mut">Saved in Your offers below.</span></div>`;
 if(reward)o+=`<div class="rw"><small>Show this code to staff</small><div class="code">${reward}</div></div>`;
 if(ready)o+=`<div class="rw"><small>Reward unlocked</small><b>${esc(c.reward)}</b></div><button class="btn" onclick="redeem()">Redeem reward</button>`;
 o+=`${DEMO?'<button class="btn alt" onclick="collect()">Test scan (demo only)</button>':''}</div>
 <div class="card"><div class="row2"><h2>Your offers</h2><span class="pill">${av.length}</span></div>${of.length?of.slice().reverse().map(x=>`<div class="of ${x.used||isExp(x)?'u':''}"><div><div class="tag">${esc(x.type||'Offer')}</div><b>${esc(x.text)}</b><div class="mut sm">${x.used?'Used '+fd(x.usedAt):x.exp?(isExp(x)?'Expired '+fd(x.exp):'Valid until '+fd(x.exp)):'No expiry'}</div></div>${x.used||isExp(x)?'':`<button class="btn sm" onclick="useOffer('${x.id}')">Use</button>`}</div>`).join(''):'<p class="sub" style="margin:0">Welcome, birthday and surprise offers will appear here.</p>'}</div>
 ${socials()}<p class="note"><a href="#" onclick="setS(null);reward=null;sur=null;render();return false">Sign out</a></p>`;
 return o}
const tp=(id,b)=>{const i=$('#'+id),sh=i.type=='password';i.type=sh?'text':'password';b.innerHTML=sh?IC.off:IC.eye};
const rc=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const cdMs=()=>S.cfg.cooldown*(S.cfg.cdUnit=='h'?36e5:6e4);
const fmtW=m=>m>=54e5?(m/36e5).toFixed(1)+' h':Math.ceil(m/6e4)+' min';
const fb=b=>b?new Date(b+'T00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'—';
const isExp=x=>x.exp&&x.exp<Date.now();
const scanUrl=()=>(S.cfg.base||location.href.split('#')[0].split('?')[0])+'#scan='+S.cfg.token;
function give(u,text,type){u.offers=u.offers||[];u.offers.push({id:Date.now().toString(36)+rc(),t:Date.now(),text,type,code:rc(),used:false,exp:+S.cfg.expDays>0?Date.now()+S.cfg.expDays*864e5:0})}
function bdCheck(u){const c=S.cfg,n=new Date();if(!c.bOffer||!u.bday||+u.bday.slice(5,7)!=n.getMonth()+1||u.bdYear==n.getFullYear())return;give(u,c.bOffer,'Birthday');u.bdYear=n.getFullYear();sur={t:'Happy birthday',x:c.bOffer};save()}
function doScan(){pend=null;try{history.replaceState(null,'',location.pathname)}catch(e){}collect()}
function useOffer(id){const o=me().offers.find(x=>x.id==id);if(!o||o.used)return;if(isExp(o))return toast('This offer has expired');if(!confirm('Redeem now? Only confirm at the counter, in front of staff.'))return;o.used=true;o.usedAt=Date.now();reward=o.code;sur=null;save();render()}
async function reg(){const n=v('n').trim(),p=v('p').replace(/\D/g,''),w=v('w'),b=v('b');
 if(n.length<2||p.length<7||w.length<4)return toast('Please enter your name, a valid phone number and a password of 4+ characters');
 if(!$('#cons').checked)return toast('Please tick the consent box to join');
 if(S.users.some(u=>u.phone==p))return toast('This number is already registered. Use Sign in.');
 const u={id:Date.now().toString(36),name:n,phone:p,hash:await h(w),bday:b,stamps:0,total:0,redeemed:0,joined:Date.now(),last:0,visits:[],offers:[],consent:true};
 S.users.push(u);setS(p,$('#rm').checked);pend=null;sur=null;if(S.cfg.wOffer){give(u,S.cfg.wOffer,'Welcome');sur={t:'Welcome gift',x:S.cfg.wOffer}}collect(true)}
async function login(){const p=v('p').replace(/\D/g,''),u=S.users.find(x=>x.phone==p);
 if(!u||u.hash!=await h(v('w')))return toast('Wrong phone or password');setS(p,$('#rm').checked);if(pend)doScan();else render()}
function collect(keep){const u=me(),c=S.cfg,w=cdMs()-(Date.now()-(u.last||0));u.offers=u.offers||[];
 if(w>0){render();return toast('You already collected a stamp recently. Next one in '+fmtW(w))}
 u.stamps++;u.total++;u.last=Date.now();u.visits.push(u.last);anim=Math.min(u.stamps,+c.need)-1;reward=null;if(!keep)sur=null;
 const pos=(u.stamps-1)%(+c.need)+1,L=String(c.sat).split(',').map(x=>+x.trim()).filter(Boolean);
 if(c.sOffer&&L.includes(pos)){give(u,c.sOffer,'Surprise');sur={t:'Surprise unlocked',x:c.sOffer}}
 bdCheck(u);save();render()}
function redeem(){const u=me();u.stamps-=+S.cfg.need;u.redeemed++;reward=Math.random().toString(36).slice(2,6).toUpperCase();save();render()}
function adm(){
 if(!isAdm)return `<div class="card"><h2>Owner login</h2><p class="sub">Enter your PIN to open the dashboard.</p><div class="pw"><input id="pin" type="password" placeholder="PIN (demo: 1234)"><button type="button" class="eye" aria-label="Show or hide PIN" onclick="tp('pin',this)">${IC.eye}</button></div><button class="btn" onclick="if(v('pin')==S.cfg.pin){isAdm=true;render()}else toast('Wrong PIN')">Open dashboard</button></div>`;
 const U=S.users,wk=Date.now()-6048e5,tabs=[['o','Overview'],['c','Customers'],['q','QR & NFC'],['s','Settings']];
 let o=`<div class="tabs">${tabs.map(t=>`<button class="${aTab==t[0]?'on':''}" onclick="aTab='${t[0]}';render()">${t[1]}</button>`).join('')}</div>`;
 if(aTab=='o'){const tot=U.reduce((a,u)=>a+u.total,0),rd=U.reduce((a,u)=>a+u.redeemed,0),bm=U.filter(u=>u.bday&&+u.bday.slice(5,7)==new Date().getMonth()+1).length;
  o+=`<div class="stats"><div class="stat"><b>${U.length}</b>Members</div><div class="stat"><b>${tot}</b>Stamps given</div><div class="stat"><b>${rd}</b>Rewards redeemed</div><div class="stat"><b>${U.filter(u=>u.last>wk).length}</b>Active, 7 days</div><div class="stat"><b>${bm}</b>Birthdays this month</div></div>
  <div class="card" style="margin-top:16px"><h2>Latest sign-ups</h2>${U.slice(-5).reverse().map(u=>`<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('')||'<p class="sub" style="margin:0">No members yet. Switch to Customer view and join.</p>'}</div>`}
 if(aTab=='c'){const L=U.filter(u=>(u.name+u.phone).toLowerCase().includes(q.toLowerCase()));
  o+=`<div class="row"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;render();const e=$('input');e.focus();e.setSelectionRange(99,99)"><button class="btn sm" onclick="exp()">Export CSV</button></div>
  <div class="card tw" style="margin-top:12px"><table><tr><th>Name</th><th>Phone</th><th>Birthday</th><th>Stamps</th><th>Visits</th><th>Rewards</th><th>Offers held</th><th>Joined</th><th>Last visit</th><th></th></tr>
  ${L.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.phone)}</td><td>${fb(u.bday)}</td><td>${u.stamps}</td><td>${u.total}</td><td>${u.redeemed}</td><td>${(u.offers||[]).filter(x=>!x.used&&!isExp(x)).length}</td><td>${fd(u.joined)}</td><td>${fd(u.last)}</td><td><a href="#" onclick="del('${u.id}');return false" style="color:#c33">Delete</a></td></tr>`).join('')||'<tr><td colspan=10 class="mut">No customers yet</td></tr>'}</table></div>`}
 if(aTab=='q'){const c=S.cfg;
  o+=`<div class="card"><h2>Scan point</h2><p class="sub">One code for the counter or table tents. A scan or NFC tap opens the page and adds a stamp after sign-in.</p>
  <label>Page address (your live domain, e.g. https://cafe.yourdomain.com/)</label><input value="${esc(c.base||location.href.split('#')[0].split('?')[0])}" onchange="S.cfg.base=this.value.trim();save();render()">
  <label>Link for the QR code or NFC tag</label><input readonly class="ro" value="${esc(scanUrl())}" onclick="this.select()">
  <div class="qr" id="qrb"></div>
  <div class="row"><button class="btn sm" onclick="dlQR()">Download QR (SVG)</button><button class="btn sm alt" onclick="cpL()">Copy link</button><button class="btn sm alt" onclick="regen()">Regenerate code</button></div></div>
  <div class="card"><h2>NFC tag</h2><p class="sub" style="margin:0">Buy NTAG213 or NTAG215 stickers, write the link above as a URL record with a free app such as NFC Tools, then lock the tag. Most recent iPhones and Android phones open it on tap. Regenerating the code disables any leaked link.</p></div>`}
 if(aTab=='s'){const c=S.cfg,f=(i,l,x,t)=>`<label>${l}</label><input id="${i}" ${t||''} value="${esc(x)}">`;
  o+=`<div class="card"><h2>Brand</h2><p class="sub">On this demo, brand changes only show on this device. For live sites, edit config.js.</p><div class="row"><button class="btn alt sm" onclick="pre('cafe')">Cafe preset</button><button class="btn alt sm" onclick="pre('rest')">Restaurant preset</button></div>
  ${f('cn','Business name',c.name)}${f('ct','Tagline',c.tagline)}<div class="row"><div>${f('ce','Logo letters (if no image)',c.emoji)}</div><div>${f('cc','Brand colour',c.color,'type=color')}</div></div>
  <label>Logo image (optional, under 300 KB)</label><input type="file" id="cl" accept="image/*">
  ${f('ci','Instagram link',c.ig)}${f('cf','Facebook link',c.fb)}${f('cw','WhatsApp link (https://wa.me/…)',c.wa)}${f('cs','Website link',c.web)}</div>
  <div class="card"><h2>Rewards</h2><div class="row"><div>${f('cn2','Stamps needed',c.need,'type=number min=2 max=20')}</div><div><label>Time between stamps</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input id="cd" type="number" min="0" value="${c.cooldown}"><select id="cu"><option value="m"${c.cdUnit=='m'?' selected':''}>minutes</option><option value="h"${c.cdUnit=='h'?' selected':''}>hours</option></select></div></div></div>${f('cr','Reward when card is full',c.reward)}${f('cp','Owner PIN',c.pin)}</div>
  <div class="card"><h2>Offers</h2><p class="sub">Leave any offer blank to switch it off.</p>${f('wo','Welcome offer (given when a customer joins)',c.wOffer)}${f('bo','Birthday offer (given in their birthday month)',c.bOffer)}${f('ca','Surprise on stamp number(s), e.g. 3,6',c.sat)}${f('co','Surprise offer',c.sOffer)}${f('cx','Offers expire after (days, 0 = never)',c.expDays,'type=number min=0')}</div>
  <button class="btn" onclick="sv()">Save settings</button><button class="btn alt" onclick="if(confirm('Delete ALL demo data?')){S.users=[];save();setS(null);render()}">Reset demo data</button>`}
 return o}
function pre(k){S.cfg={...PRE[k],pin:S.cfg.pin,base:S.cfg.base,token:S.cfg.token};save();render()}
function sv(){const c=S.cfg,g=(i,d)=>$('#'+i)?v(i):d,done=()=>{save();toast('Saved');render()};
 Object.assign(c,{name:g('cn',c.name)||'My Brand',tagline:g('ct'),emoji:g('ce').trim(),color:g('cc',c.color),ig:g('ci'),fb:g('cf'),wa:g('cw'),web:g('cs'),need:Math.max(2,Math.min(20,+g('cn2')||8)),cooldown:Math.max(0,+g('cd')||0),cdUnit:g('cu','m'),reward:g('cr'),pin:g('cp')||'1234',wOffer:g('wo').trim(),bOffer:g('bo').trim(),sat:g('ca'),sOffer:g('co').trim(),expDays:Math.max(0,+g('cx')||0)});
 const f=$('#cl').files[0];if(f){if(f.size>3e5)return toast('Logo too big (max 300 KB)');const r=new FileReader();r.onload=()=>{c.logo=r.result;done()};r.readAsDataURL(f)}else done()}
function dl(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove()}
const slug=()=>S.cfg.name.replace(/\W+/g,'-');
function qrSvg(){if(typeof qrcode=='undefined')return '';const z=qrcode(0,'M');z.addData(scanUrl());z.make();return z.createSvgTag({cellSize:6,margin:2,scalable:true})}
function drawQR(){const b=$('#qrb');if(b)b.innerHTML=qrSvg()||'<p class="mut">QR library could not load.</p>'}
async function cpL(){try{await navigator.clipboard.writeText(scanUrl());toast('Link copied')}catch(e){toast('Tap the link box and copy it')}}
function regen(){if(confirm('Old printed QR codes and NFC tags will stop working. Continue?')){S.cfg.token=Math.random().toString(36).slice(2,10);save();render()}}
function dlQR(){const x=qrSvg();if(x)dl(slug()+'-QR.svg',x,'image/svg+xml')}
function del(id){if(confirm('Delete this customer?')){S.users=S.users.filter(u=>u.id!=id);save();render()}}
function exp(){const e=x=>'"'+String(x).replace(/"/g,'""')+'"',rows=[['Name','Phone','Birthday','Current stamps','Total visits','Rewards redeemed','Joined','Last visit']].concat(S.users.map(u=>[u.name,u.phone,u.bday||'',u.stamps,u.total,u.redeemed,fd(u.joined),fd(u.last)]));
 dl(slug()+'-customers.csv','\ufeff'+rows.map(r=>r.map(e).join(',')).join('\n'),'text/csv')}
$('#mc').onclick=()=>{mode='c';render()};$('#ma').onclick=()=>{mode='a';render()};try{const m=(location.hash+location.search).match(/scan=([\w-]+)/);if(m)pend=m[1]}catch(e){}render();if(pend&&me())doScan();
