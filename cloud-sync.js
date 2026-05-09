/* Pump Tracker Cloud Sync using Supabase Magic Link.

Setup:
1) Run supabase-schema.sql in Supabase SQL Editor.
2) Create supabase-config.js from supabase-config.example.js.
3) Add before </body> in index.html:
   <script src="supabase-config.js"></script>
   <script type="module" src="cloud-sync.js"></script>

This module can also run on index-cloud.html and sync data changed by an iframe because
localStorage is shared by origin.
*/

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const LOCAL_KEY = 'pump-tracker-v6';
const TABLE = 'pump_tracker_state';
const STATUS_ID = 'cloudSyncStatus';
const PANEL_ID = 'cloudSyncPanel';

const url = window.PUMP_TRACKER_SUPABASE_URL;
const anonKey = window.PUMP_TRACKER_SUPABASE_ANON_KEY;
let supabase = null;
let currentUser = null;
let applyingRemote = false;
let saveTimer = null;
let nativeSetItem = localStorage.setItem.bind(localStorage);
let lastLocalSnapshot = localStorage.getItem(LOCAL_KEY) || '';
let pollTimer = null;

function addStyles(){
  const style=document.createElement('style');
  style.textContent=`
  #${STATUS_ID}{position:fixed;left:12px;bottom:12px;z-index:999999;border:1px solid #314665;background:#152033;color:#c4d0e2;border-radius:999px;padding:8px 12px;font:12px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer}
  #${STATUS_ID}.ok{border-color:#34d399;color:#34d399}#${STATUS_ID}.warn{border-color:#fbbf24;color:#fbbf24}#${STATUS_ID}.bad{border-color:#f87171;color:#f87171}
  #${PANEL_ID}{position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.65);display:none;align-items:center;justify-content:center;padding:16px}
  #${PANEL_ID}.show{display:flex}#${PANEL_ID} .box{width:min(460px,100%);background:#152033;border:1px solid #314665;border-radius:16px;padding:16px;color:#e4ecf7;font:14px system-ui;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  #${PANEL_ID} h3{margin:0 0 8px;font-size:18px}#${PANEL_ID} p{margin:6px 0;color:#c4d0e2;line-height:1.5}#${PANEL_ID} input{width:100%;padding:10px;border-radius:10px;border:1px solid #314665;background:#101a2a;color:#e4ecf7;margin:8px 0;font:inherit}#${PANEL_ID} button{border:1px solid #314665;background:#101a2a;color:#e4ecf7;border-radius:10px;padding:9px 12px;font-weight:700;margin:4px;cursor:pointer}#${PANEL_ID} button.primary{border-color:#38bdf8;color:#38bdf8;background:rgba(56,189,248,.12)}#${PANEL_ID} button.danger{border-color:#f87171;color:#f87171}#${PANEL_ID} .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#${PANEL_ID} .small{font-size:12px;color:#7a8ca5}`;
  document.head.appendChild(style);
}

function setStatus(text,type='warn'){
  let el=document.getElementById(STATUS_ID);
  if(!el){el=document.createElement('button');el.type='button';el.id=STATUS_ID;el.onclick=openPanel;document.body.appendChild(el);}
  el.textContent=text;el.className=type;
}
function readLocal(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}catch{return {}}}
function writeLocal(data){applyingRemote=true;nativeSetItem(LOCAL_KEY,JSON.stringify(data||{}));lastLocalSnapshot=localStorage.getItem(LOCAL_KEY)||'';applyingRemote=false}
function stamp(data){const next=data||{};next._cloud={...(next._cloud||{}),updated_at:new Date().toISOString()};return next}
function clean(data){const c=JSON.parse(JSON.stringify(data||{}));if(c._cloud)delete c._cloud;return c}
function localDate(data){return data?._cloud?.updated_at||null}
function isNewer(a,b){if(!a)return false;if(!b)return true;return new Date(a).getTime()>new Date(b).getTime()}

async function getRemote(){
  const {data,error}=await supabase.from(TABLE).select('data,updated_at').eq('user_id',currentUser.id).maybeSingle();
  if(error)throw error;return data;
}
async function pushLocal(){
  if(!currentUser||applyingRemote)return;
  const local=stamp(readLocal());writeLocal(local);
  const {error}=await supabase.from(TABLE).upsert({user_id:currentUser.id,data:clean(local)},{onConflict:'user_id'});
  if(error)throw error;setStatus('Cloud: synced','ok');
}
async function pullRemote(){
  if(!currentUser)return false;
  const remote=await getRemote();if(!remote?.data)return false;
  if(isNewer(remote.updated_at,localDate(readLocal()))){
    const data=remote.data||{};data._cloud={updated_at:remote.updated_at};writeLocal(data);setStatus('Cloud: updated','ok');setTimeout(()=>location.reload(),500);return true;
  }
  return false;
}
async function firstSync(){
  try{const remote=await getRemote();if(!remote){await pushLocal();return}if(isNewer(remote.updated_at,localDate(readLocal())))await pullRemote();else await pushLocal();}
  catch(e){console.error(e);setStatus('Cloud: sync error','bad')}
}
function queuePush(){
  if(!currentUser||applyingRemote)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>pushLocal().catch(e=>{console.error(e);setStatus('Cloud: save failed','bad')}),1200);
}
function patchLocalStorage(){
  if(!localStorage.__pumpTrackerCloudPatched){
    const old=nativeSetItem;
    localStorage.setItem=function(key,value){old(key,value);if(key===LOCAL_KEY&&!applyingRemote){lastLocalSnapshot=String(value||'');queuePush();}};
    localStorage.__pumpTrackerCloudPatched=true;
  }
  window.addEventListener('storage',e=>{if(e.key===LOCAL_KEY&&!applyingRemote){lastLocalSnapshot=e.newValue||'';queuePush();}});
  clearInterval(pollTimer);
  pollTimer=setInterval(()=>{const now=localStorage.getItem(LOCAL_KEY)||'';if(now!==lastLocalSnapshot&&!applyingRemote){lastLocalSnapshot=now;queuePush();}},2000);
}
async function realtime(){
  supabase.channel('pump-tracker-state-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:`user_id=eq.${currentUser.id}`},()=>pullRemote().catch(console.error)).subscribe();
}
function openPanel(){
  let p=document.getElementById(PANEL_ID);
  if(!p){p=document.createElement('div');p.id=PANEL_ID;p.innerHTML=`<div class="box"><h3>Cloud Sync</h3><p>Sync this tracker between more than one iPhone or browser.</p><div id="cloudSignedOut"><input id="cloudEmail" type="email" placeholder="email@example.com"><div class="row"><button class="primary" id="cloudMagicBtn">Send magic link</button></div><p class="small">Use the same email on every device.</p></div><div id="cloudSignedIn" style="display:none"><p id="cloudUser"></p><div class="row"><button class="primary" id="cloudPush">Upload this device</button><button id="cloudPull">Download cloud data</button><button class="danger" id="cloudOut">Sign out</button></div></div><div class="row"><button id="cloudClose">Close</button></div></div>`;document.body.appendChild(p);p.addEventListener('click',e=>{if(e.target===p)p.classList.remove('show')});p.querySelector('#cloudClose').onclick=()=>p.classList.remove('show');p.querySelector('#cloudMagicBtn').onclick=sendMagic;p.querySelector('#cloudPush').onclick=()=>pushLocal().then(()=>alert('Uploaded'));p.querySelector('#cloudPull').onclick=()=>pullRemote().then(()=>alert('Checked cloud data'));p.querySelector('#cloudOut').onclick=async()=>{await supabase.auth.signOut();currentUser=null;setStatus('Cloud: sign in needed','warn');updatePanel()};}
  updatePanel();p.classList.add('show');
}
function updatePanel(){
  const a=document.getElementById('cloudSignedOut'),b=document.getElementById('cloudSignedIn'),u=document.getElementById('cloudUser');if(!a||!b)return;
  if(currentUser){a.style.display='none';b.style.display='block';u.textContent='Signed in as: '+(currentUser.email||currentUser.id)}else{a.style.display='block';b.style.display='none'}
}
async function sendMagic(){
  const email=document.getElementById('cloudEmail').value.trim();if(!email)return alert('Enter email');
  const {error}=await supabase.auth.signInWithOtp({email});if(error)return alert(error.message);alert('Magic link sent. Open it from this device.');
}
async function afterSignedIn(){patchLocalStorage();await firstSync();await realtime();setStatus('Cloud: synced','ok');updatePanel()}
async function init(){
  addStyles();
  if(!url||!anonKey||url.includes('YOUR_PROJECT')||anonKey.includes('YOUR_SUPABASE')){setStatus('Cloud: setup needed','warn');return}
  supabase=createClient(url,anonKey);setStatus('Cloud: checking','warn');
  const {data}=await supabase.auth.getSession();currentUser=data.session?.user||null;
  supabase.auth.onAuthStateChange(async(_event,session)=>{currentUser=session?.user||null;if(currentUser)await afterSignedIn();else setStatus('Cloud: sign in needed','warn')});
  if(currentUser)await afterSignedIn();else setStatus('Cloud: sign in needed','warn');
}
init();
