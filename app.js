const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const svgNS = 'http://www.w3.org/2000/svg';
const mods = { tracking: true, reveal: true, noclip: false, instantKick: false };
const initialPlayers = [
  { id: 'dez', name: 'Dez', color: '#c5f279', x: 563, y: 201, role: 'Crewmate', self: true },
  { id: 'red', name: 'Red', color: '#e56e68', x: 751, y: 197, role: 'Impostor' },
  { id: 'cyan', name: 'Cyan', color: '#64cbd1', x: 540, y: 412, role: 'Crewmate' },
  { id: 'purple', name: 'Purple', color: '#a083d5', x: 384, y: 220, role: 'Impostor' },
  { id: 'yellow', name: 'Yellow', color: '#e7cc65', x: 643, y: 348, role: 'Crewmate' },
  { id: 'white', name: 'White', color: '#dedfd4', x: 178, y: 161, role: 'Crewmate' },
  { id: 'blue', name: 'Blue', color: '#6a91d2', x: 901, y: 320, role: 'Crewmate' },
  { id: 'orange', name: 'Orange', color: '#dfa06a', x: 350, y: 431, role: 'Crewmate' }
];
let players = [];
let filter = 'all';
let selectedPlayer = null;
let sortAscending = false;
let zoom = 1;
let startedAt = Date.now();
let elapsedBeforePause = 0;
let isPaused = false;
let toastTimer;
let activity = [];
const rooms = [
  { name: 'UPPER ENGINE', points: [[99,115],[220,115],[247,142],[247,204],[220,222],[99,222]], label: [172,139], center: [171,169], hue: '#32302c' },
  { name: 'REACTOR', points: [[65,272],[157,272],[174,290],[174,357],[155,379],[65,379]], label: [119,293], center: [114,327], hue: '#2c2c3c' },
  { name: 'LOWER ENGINE', points: [[99,419],[222,419],[247,442],[247,497],[220,520],[99,520]], label: [170,501], center: [171,458], hue: '#32302c' },
  { name: 'SECURITY', points: [[271,276],[368,276],[368,369],[271,369]], label: [319,293], center: [319,330], hue: '#2b3530' },
  { name: 'MEDBAY', points: [[315,165],[438,165],[438,259],[408,282],[315,282]], label: [376,184], center: [380,225], hue: '#29383a' },
  { name: 'CAFETERIA', points: [[485,92],[641,92],[693,140],[693,241],[641,285],[485,285],[455,252],[455,130]], label: [574,115], center: [570,191], hue: '#2d323b' },
  { name: 'WEAPONS', points: [[751,146],[817,146],[852,180],[852,235],[824,260],[751,260],[726,231],[726,174]], label: [788,164], center: [788,204], hue: '#35332c' },
  { name: 'O2', points: [[711,288],[790,288],[790,361],[711,361]], label: [749,307], center: [750,334], hue: '#30392e' },
  { name: 'NAVIGATION', points: [[872,273],[944,273],[967,300],[967,364],[944,386],[872,386]], label: [916,292], center: [915,331], hue: '#2e343c' },
  { name: 'ADMIN', points: [[610,322],[685,322],[711,343],[711,398],[610,398]], label: [656,339], center: [655,367], hue: '#3a2d31' },
  { name: 'ELECTRICAL', points: [[279,402],[408,402],[408,486],[279,486]], label: [344,421], center: [345,447], hue: '#36342b' },
  { name: 'STORAGE', points: [[466,367],[574,367],[595,389],[595,497],[569,520],[466,520],[445,497],[445,389]], label: [521,500], center: [520,442], hue: '#34352d' },
  { name: 'COMMUNICATIONS', points: [[635,449],[731,449],[747,465],[747,520],[635,520]], label: [690,507], center: [689,480], hue: '#30373a' },
  { name: 'SHIELDS', points: [[783,420],[854,420],[881,445],[881,495],[854,519],[783,519],[760,495],[760,445]], label: [819,501], center: [820,464], hue: '#36312d' }
];
const corridors = [
  [[173,214],[211,214],[211,428],[173,428]],
  [[205,305],[281,305],[281,341],[205,341]],
  [[222,170],[321,170],[321,207],[222,207]],
  [[247,190],[282,190],[282,436],[247,436]],
  [[246,448],[285,448],[285,479],[246,479]],
  [[399,215],[467,215],[467,249],[399,249]],
  [[409,446],[458,446],[458,477],[409,477]],
  [[504,278],[541,278],[541,382],[504,382]],
  [[534,331],[620,331],[620,368],[534,368]],
  [[681,191],[735,191],[735,224],[681,224]],
  [[799,246],[831,246],[831,441],[799,441]],
  [[786,317],[883,317],[883,351],[786,351]],
  [[568,464],[646,464],[646,497],[568,497]],
  [[735,464],[774,464],[774,497],[735,497]]
];
function element(tag, attrs = {}) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}
function polygon(points, className, extra = {}) {
  return element('polygon', { points: points.map(p => p.join(',')).join(' '), class: className, ...extra });
}
function buildMap() {
  corridors.forEach(points => $('#ship-corridors').append(polygon(points, 'corridor')));
  rooms.forEach(room => {
    $('#ship-rooms').append(polygon(room.points, 'map-room', { style: `fill:${room.hue}` }), polygon(room.points, 'room-grid'));
    const label = element('text', { x: room.label[0], y: room.label[1], class: 'room-label', style: room.name.length > 12 ? 'font-size:8px' : '' });
    label.textContent = room.name;
    $('#ship-labels').append(label);
  });
  const furniture = $('#ship-furniture');
  // Original schematic furniture provides orientation without using game assets.
  [[171,170],[171,459]].forEach(([x,y]) => {
    furniture.append(element('rect', {x:x-43,y:y-20,width:86,height:40,rx:14,class:'room-detail'}));
    for(let i=0;i<5;i++) furniture.append(element('path',{d:`M${x-28+i*14} ${y-18}v36`,stroke:'#697268','stroke-width':3,opacity:.5}));
    furniture.append(element('rect',{x:x-12,y:y-26,width:24,height:8,rx:2,fill:'#736446'}));
  });
  [[525,163],[620,163],[570,233]].forEach(([x,y]) => {
    furniture.append(element('circle',{cx:x,cy:y,r:20,class:'room-detail',style:'fill:#354554;stroke:#627486'}));
    furniture.append(element('circle',{cx:x,cy:y,r:9,fill:'#405263'}));
  });
  [[335,207],[335,247],[406,207],[406,247]].forEach(([x,y])=> {
    furniture.append(element('rect',{x:x-9,y:y-10,width:18,height:23,rx:3,class:'room-detail',style:'fill:#526c6e'}));
    furniture.append(element('rect',{x:x-7,y:y-8,width:14,height:6,rx:2,fill:'#9bafac'}));
  });
  furniture.append(element('rect',{x:91,y:308,width:39,height:42,rx:8,class:'room-detail',style:'fill:#46405e;stroke:#79688c'}));
  furniture.append(element('path',{d:'M102 314v29m8-29v29m8-29v29',stroke:'#9c82bd','stroke-width':3,opacity:.6}));
  [[300,307],[326,307],[352,307]].forEach(([x,y])=> furniture.append(element('rect',{x:x-9,y,width:17,height:12,rx:2,class:'room-detail',style:'fill:#668478'})));
  [[482,399],[501,418],[477,439],[552,469],[555,403]].forEach(([x,y],i)=> furniture.append(element('rect',{x,y,width:21+(i%2)*7,height:22,rx:2,class:'room-detail',style:'fill:#4a503a;stroke:#68704d'})));
  furniture.append(element('rect',{x:628,y:356,width:61,height:20,rx:4,class:'room-detail',style:'fill:#594045;stroke:#805058'}));
  furniture.append(element('rect',{x:292,y:434,width:26,height:36,rx:2,class:'room-detail'}));
  furniture.append(element('path',{d:'M325 443h18v18h18v-26h26',stroke:'#8a804f','stroke-width':3,fill:'none'}));
  furniture.append(element('circle',{cx:789,cy:207,r:21,class:'room-detail',style:'fill:#504b3b'}));
  furniture.append(element('path',{d:'M786 206l27-17m-27 17 6 15',stroke:'#9c916d','stroke-width':7}));
  furniture.append(element('circle',{cx:820,cy:462,r:22,class:'room-detail'}));
  furniture.append(element('path',{d:'M810 452h20v20h-20Z',stroke:'#a89269',fill:'#6e6043'}));
  furniture.append(element('path',{d:'M897 313h28v15h-28m0 8h28v15h-28M651 464h22v14h-22m30-14h22v14h-22',class:'room-detail'}));
  furniture.append(element('circle',{cx:750,cy:333,r:17,class:'room-detail',style:'fill:#4b6046'}));
}
function inPolygon(x, y, points) {
  let inside = false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i], [xj,yj]=points[j];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function onFloor(x,y) {
  return rooms.some(r=>inPolygon(x,y,r.points)) || corridors.some(p=>inPolygon(x,y,p));
}
function roomName(player) {
  const room=rooms.find(r=>inPolygon(player.x,player.y,r.points));
  return room ? room.name.toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()) : onFloor(player.x,player.y) ? 'Hallway' : 'Outside ship';
}
function alivePlayers() { return players.filter(p=>p.status==='alive'); }
function impostors() { return alivePlayers().filter(p=>p.role==='Impostor'); }
function crewIcon(player) { return `<svg class="crew-avatar" style="color:${player.color}" aria-hidden="true"><use href="#crew"/></svg>`; }
function renderPlayers() {
  const alive=alivePlayers();
  const visible=alive.filter(p=>filter!=='impostor'||(mods.reveal&&p.role==='Impostor'));
  if(sortAscending) visible.sort((a,b)=>a.name.localeCompare(b.name));
  $('#player-list').innerHTML=visible.length ? visible.map(p=>`<button class="player-row ${p.self?'you':''}" data-player="${p.id}" aria-label="Inspect ${p.name}">${crewIcon(p)}<span><span class="player-name">${p.name}${p.self?'<span class="you-label">YOU</span>':''}</span><span class="player-room">${mods.tracking||p.self?roomName(p):'Location hidden'}</span></span><span class="role-label ${mods.reveal&&p.role==='Impostor'?'impostor':''}">${mods.reveal?p.role:'Unknown'}</span><svg class="row-chevron"><use href="#i-chevron"/></svg></button>`).join('') : `<div class="empty-state">${mods.reveal?'No impostors remaining.':'Enable Reveal impostors to view roles.'}</div>`;
  $('#player-count').textContent=alive.length;
  $('#roster-count').textContent=alive.length;
  $('.nav-count').textContent=alive.length;
  $('#impostor-count').textContent=mods.reveal?impostors().length:'—';
  $('#filter-impostor-count').textContent=mods.reveal?impostors().length:'?';
  $('#roster-summary').textContent=mods.reveal?`${alive.length-impostors().length} crewmates · ${impostors().length} impostors`:'Player roles hidden';
  $('.roster-bottom>span:last-child').textContent=`${alive.length} / 10`;
  renderMarkers();
}
function renderMarkers() {
  const group=$('#player-markers');
  group.replaceChildren();
  alivePlayers().filter(p=>mods.tracking||p.self).forEach(p=>{
    const g=element('g',{class:'player-marker',transform:`translate(${p.x},${p.y})`,style:`color:${p.self?'#c5f279':mods.reveal&&p.role==='Impostor'?'#f17c79':p.color}`,tabindex:0,role:'button','aria-label':`Inspect ${p.name}`, 'data-player':p.id});
    g.append(element('ellipse',{cx:0,cy:8,rx:20,ry:9,fill:'currentColor',opacity:.12}));
    g.append(element('circle',{cx:0,cy:-3,r:22,class:'marker-ring'}));
    g.append(element('use',{href:'#crew',x:-13,y:-23,width:26,height:31,style:`color:${p.color};stroke:none`}));
    const name=element('text',{x:0,y:24,class:`marker-name ${p.self?'self-label':''}`});
    name.textContent=p.self?'Dez (you)':p.name;
    g.append(name);
    if(mods.reveal&&p.role==='Impostor') {
      g.append(element('circle',{cx:14,cy:-19,r:5,fill:'#f17c79',stroke:'#221b18','stroke-width':2}));
    }
    group.append(g);
  });
}
function logEvent(message, type='SYSTEM') {
  const timestamp=new Date().toLocaleTimeString('en-GB',{hour12:false});
  activity.unshift({message,type,timestamp});
  activity=activity.slice(0,100);
  renderLog();
}
function renderLog() {
  const container=$('#activity-log');
  container.replaceChildren();
  if(!activity.length) {
    const empty=document.createElement('p'); empty.className='empty-state'; empty.textContent='No activity yet. Your next move starts here.'; container.append(empty); return;
  }
  activity.forEach(event=>{
    const row=document.createElement('div'); row.className='log-entry';
    const time=document.createElement('span'); time.className='log-time'; time.textContent=event.timestamp;
    const dot=document.createElement('span'); dot.className='log-event-dot';
    const message=document.createElement('span'); message.textContent=event.message;
    const type=document.createElement('span'); type.className='log-type'; type.textContent=event.type;
    row.append(time,dot,message,type); container.append(row);
  });
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show');
  toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);
}
function renderMods() {
  $$('[data-mod]').forEach(button=>{
    const enabled=mods[button.dataset.mod];
    button.classList.toggle('on',enabled);
    button.setAttribute('aria-checked',String(enabled));
  });
  const status={
    tracking:mods.tracking?'All players revealed':'Player locations hidden',
    reveal:mods.reveal?`${impostors().length} impostors identified`:'Player roles hidden',
    noclip:mods.noclip?'Walk through anything':'Normal collision enabled',
    instantKick:mods.instantKick?'No vote required':'Standard voting enabled'
  };
  Object.keys(status).forEach(key=>{
    const target=$(`[data-mod-card="${key}"] .mod-status`);
    target.classList.toggle('off',!mods[key]); target.querySelector('span').textContent=status[key];
  });
  $('#mod-count').textContent=Object.values(mods).filter(Boolean).length;
  $('#tracking-state').textContent=mods.tracking?'ACTIVE':'DISABLED';
  $('#map-status').textContent=mods.tracking?'All players visible':'Only your location visible';
  $('.map-legend .imp').parentElement.hidden=!mods.reveal;
}
function distanceTo(player) {
  const self=players.find(p=>p.self);
  return Math.hypot(self.x-player.x,self.y-player.y);
}
function inspectPlayer(id) {
  selectedPlayer=id; renderDetails();
  if(!$('#player-dialog').open) $('#player-dialog').showModal();
}
function renderDetails() {
  const p=players.find(player=>player.id===selectedPlayer);
  if(!p) return;
  const distance=distanceTo(p);
  const canKill=!p.self&&p.status==='alive'&&distance<=100;
  const canKick=!p.self&&p.status==='alive'&&mods.instantKick;
  $('#player-details').innerHTML=`<div class="detail-hero">${crewIcon(p)}<div><h2>${p.name}${p.self?' <span class="badge">YOU</span>':''}</h2><p>${mods.tracking||p.self?roomName(p):'Location hidden'} · ${p.status}</p></div></div><div class="detail-row"><span>Role</span><strong>${mods.reveal?p.role:'Hidden'}</strong></div><div class="detail-row"><span>Distance from you</span><strong>${p.self?'—':mods.tracking?`${Math.round(distance/10)} m`:'Hidden'}</strong></div><div class="detail-row"><span>Elimination range</span><strong>${p.self?'—':distance<=100?'Within range':'Out of range'}</strong></div>${p.self?'<p class="detail-help">Use WASD or arrow keys to move. Enable noclip to pass through walls. Close this panel before moving.</p>':`<div class="detail-actions"><button id="kill-player" class="action-button danger" ${canKill?'':'disabled'}>Eliminate player</button><button id="kick-player" class="action-button" ${canKick?'':'disabled'}>Instant kick</button></div><p class="detail-help">${p.status!=='alive'?'This player has left active play.':!mods.instantKick?'Enable Instant kick in Mod controls to remove a player without voting.':'Instant kick is enabled. No vote is required.'} ${distance>100&&p.status==='alive'?'Move within 10 m to eliminate this player.':''}</p>`}`;
}
function removePlayer(action) {
  const p=players.find(player=>player.id===selectedPlayer);
  if(!p||p.self||p.status!=='alive') return;
  if(action==='kill'&&distanceTo(p)>100) {toast('Move within 10 m of the player first.');return;}
  if(action==='kick'&&!mods.instantKick) {toast('Enable Instant kick first.');return;}
  p.status=action==='kill'?'eliminated':'kicked';
  logEvent(`${p.name} ${action==='kill'?'was eliminated nearby.':'was kicked. No vote required.'}`,action==='kill'?'ELIMINATION':'HOST ACTION');
  toast(`${p.name} ${action==='kill'?'eliminated':'removed from the session'}.`);
  renderPlayers();renderMods();renderDetails();
}
function resetSession(notify=true) {
  players=initialPlayers.map(p=>({...p,status:'alive'})); startedAt=Date.now(); elapsedBeforePause=0; isPaused=false;
  $('#session-time').textContent='00:00'; selectedPlayer=null;
  if($('#player-dialog').open) $('#player-dialog').close();
  renderPlayers();renderMods();
  logEvent(notify?'Session reset. All players are back on board.':'Sandbox initialized. 8 players on board.');
  if(notify) toast('Fresh session. Same ship, new possibilities.');
}
function setZoom(value) {
  zoom=Math.max(.8,Math.min(1.8,value));
  $('#map-world').setAttribute('transform',`translate(${500*(1-zoom)},${300*(1-zoom)}) scale(${zoom})`);
  $('#zoom-label').textContent=`${Math.round(zoom*100)}%`;
}
function info(title,html) {
  $('#info-title').textContent=title;
  $('#info-content').innerHTML=html;
  $('#info-dialog').showModal();
}
function showSettings() {
  info('SANDBOX SETTINGS',`<h2>Your space. Your pace.</h2><p>Pause the local simulation while keeping every control available, or start over with the original crew.</p><button class="action-button" id="pause-simulation">${isPaused?'Resume':'Pause'} simulation</button><p><strong>Controls:</strong> WASD / arrow keys move Dez. Select any player to inspect, eliminate within 10 m, or instantly kick when enabled.</p><p>Mods and player changes apply to this browser session only.</p>`);
}
document.addEventListener('click',event=>{
  const player=event.target.closest('[data-player]');
  if(player) inspectPlayer(player.dataset.player);
  const toggle=event.target.closest('[data-mod]');
  if(toggle) {
    const key=toggle.dataset.mod;
    // When restoring collisions, return to a valid floor if noclip left the ship.
    if(key==='noclip'&&mods.noclip) {
      const self=players.find(p=>p.self);
      if(!onFloor(self.x,self.y)) {
        const nearest=rooms.reduce((best,r)=>Math.hypot(self.x-r.center[0],self.y-r.center[1])<Math.hypot(self.x-best.center[0],self.y-best.center[1])?r:best,rooms[0]);
        [self.x,self.y]=nearest.center;
        logEvent('Dez returned to the nearest room as collision was restored.','MOVEMENT');
      }
    }
    mods[key]=!mods[key];
    const label=toggle.getAttribute('aria-label');
    logEvent(`${label} ${mods[key]?'enabled':'disabled'}.`,'MOD CHANGE');
    renderPlayers();renderMods();
    toast(`${label} ${mods[key]?'enabled':'disabled'}.`);
  }
  const nav=event.target.closest('[data-page]');
  if(nav) {
    const page=nav.dataset.page;
    if(page==='settings') {showSettings();return;}
    const pages={overview:['Overview','Eyes everywhere.','Your crew. Your rules. The whole ship at a glance.'],map:['Live map','Every corner. Every crewmate.','A real-time view of your local simulated crew.'],players:['Players','Know your crew.','Select a player to inspect their role, location, and available actions.'],mods:['Mod controls','Play by your rules.','Fine-tune your sandbox. Every change takes effect instantly.'],activity:['Activity log','Nothing goes unnoticed.','Every action, every change. Your session, on record.']};
    document.body.dataset.page=page;
    $$('.nav-item[data-page]').forEach(item=>item.classList.toggle('active',item===nav));
    $('#breadcrumb-title').textContent=pages[page][0];
    $('#page-title').textContent=pages[page][1].slice(0,-1);
    const dot=document.createElement('span');dot.textContent='.';$('#page-title').append(dot);
    $('#page-description').textContent=pages[page][2];
  }
  const filterButton=event.target.closest('[data-filter]');
  if(filterButton) {
    filter=filterButton.dataset.filter;
    $$('[data-filter]').forEach(button=>button.classList.toggle('selected',button===filterButton));
    renderPlayers();
  }
  if(event.target.closest('.close-dialog')) event.target.closest('dialog').close();
  if(event.target.closest('#kill-player')) removePlayer('kill');
  if(event.target.closest('#kick-player')) removePlayer('kick');
  if(event.target.closest('#pause-simulation')) {
    if(!isPaused) elapsedBeforePause=Date.now()-startedAt;
    else startedAt=Date.now()-elapsedBeforePause;
    isPaused=!isPaused;
    event.target.textContent=`${isPaused?'Resume':'Pause'} simulation`;
    logEvent(`Simulation ${isPaused?'paused':'resumed'}.`);
  }
});
document.addEventListener('keydown',event=>{
  if(event.target.closest('[data-player]')&&(event.key==='Enter'||event.key===' ')) {
    event.preventDefault();inspectPlayer(event.target.closest('[data-player]').dataset.player);return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key==='k') {
    event.preventDefault();info('QUICK ACTIONS','<h2>At your command.</h2><p>Open any workspace from the sidebar. Use <strong>WASD</strong> to move, and select a player on the map or roster for actions.</p>');return;
  }
  if(event.key==='Escape') $('#map-panel').classList.remove('expanded');
  const vectors={ArrowUp:[0,-7],w:[0,-7],ArrowDown:[0,7],s:[0,7],ArrowLeft:[-7,0],a:[-7,0],ArrowRight:[7,0],d:[7,0]};
  const direction=vectors[event.key];
  if(!direction||$('dialog[open]')||event.target.closest('input,textarea,select')) return;
  event.preventDefault();
  if(isPaused) {toast('Resume the simulation in Settings to move.');return;}
  const self=players.find(p=>p.self);
  const nx=Math.max(30,Math.min(970,self.x+direction[0]));
  const ny=Math.max(65,Math.min(550,self.y+direction[1]));
  if(mods.noclip||onFloor(nx,ny)) {
    self.x=nx;self.y=ny;renderPlayers();
  } else if(!event.repeat) toast('Wall ahead. Enable Noclip to pass through.');
});
$('#session-button').addEventListener('click',()=>resetSession());
$('#sort-players').addEventListener('click',()=>{sortAscending=!sortAscending;renderPlayers();toast(sortAscending?'Players sorted by name.':'Default player order restored.');});
$('#zoom-in').addEventListener('click',()=>setZoom(zoom+.2));
$('#zoom-out').addEventListener('click',()=>setZoom(zoom-.2));
$('#center-map').addEventListener('click',()=>setZoom(1));
$('#expand-map').addEventListener('click',()=>{const expanded=$('#map-panel').classList.toggle('expanded');$('#expand-map').setAttribute('aria-label',expanded?'Restore map size':'Expand map');});
$('#clear-log').addEventListener('click',()=>{activity=[];renderLog();toast('Activity log cleared.');});
$('#help-button').addEventListener('click',()=>info('ABOUT THIS SANDBOX','<h2>A different perspective.</h2><p>Dez\'s Minion built Orbit as an independent, browser-based simulation of a crew-control console.</p><p>The uploaded archive contains a compiled <strong>Windows Unity IL2CPP game</strong> by Innersloth, not a browser application. Archive metadata was inspected; its executable is not run, patched, or connected to this panel.</p><p>All locations, roles, eliminations, wall collisions, and kicks here belong to the local simulation. No online players or game files are affected.</p>'));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
buildMap();resetSession(false);
logEvent('Player ESP and Reveal impostors are active.','MOD CHANGE');
setInterval(()=>{
  if(isPaused) return;
  const elapsed=Math.floor((Date.now()-startedAt)/1000);
  $('#session-time').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
  $('#update-time').textContent='Updated just now';
  // Simulated crewmates wander locally and respect the schematic's floor boundaries.
  alivePlayers().filter(p=>!p.self).forEach(p=>{
    const dx=(Math.random()-.5)*9,dy=(Math.random()-.5)*9;
    if(onFloor(p.x+dx,p.y+dy)) {p.x+=dx;p.y+=dy;}
  });
  renderPlayers();
  if($('#player-dialog').open) renderDetails();
},1000);
