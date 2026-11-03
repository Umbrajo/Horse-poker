import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { Poker } from './engine.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message:string)=>{throw new Error(message)};
async function readBody(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error('Missing request body');const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error('Request body too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
async function allowed(input:string){
 if(input.length>256)return false;
 const password=Deno.env.get('SITE_PASSWORD');if(!password)return false;
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(input),digest(password)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
const connected=(m:any,now:number)=>!m.bot&&!m.left&&now-(m.seen||0)<45000;
function tick(s:any,now:number){
 if(!s.game||s.ended)return;
 let g=Poker.restore(JSON.stringify(s.game));
 const humans=s.members.filter((m:any)=>!m.bot),online=humans.filter((m:any)=>connected(m,now));
 if(humans.length>1&&online.length<=1){s.ended=true;s.reason='Last player connected';s.winner=online[0]?.name||null;if(online.length){const winner=s.members.findIndex((m:any)=>m.id===online[0].id),chips=g.players.reduce((sum:number,p:any)=>sum+p.stack,0)+(g.finished?0:g.pot());g.players.forEach((p:any,i:number)=>{p.stack=i===winner?chips:0;p.fold=i!==winner;});g.result=[{i:winner,amount:chips}];}g.finished=true;g.matchOver=true;s.game=g;return;}
 // Missing players forfeit their chips; preserve the total chip count.
 s.members.forEach((m:any,i:number)=>{if(!m.bot&&!connected(m,now)){const p=g.players[i];if(p.stack){const recipient=g.players.findIndex((q:any,j:number)=>j!==i&&q.stack>0&&(s.members[j].bot||connected(s.members[j],now)));if(recipient>=0){g.players[recipient].stack+=p.stack;p.stack=0;}}p.fold=true;}});
 if(!g.finished)g.advance();
 if(g.finished){
 const live=g.players.filter((p:any)=>p.stack>0);
 if(live.length<=1||g.matchOver){s.ended=true;s.reason='Tournament won';s.winner=live[0]?.name||null;g.matchOver=true;}
 else if(!s.nextAt)s.nextAt=now+(s.cooldownSeconds??5)*1000;
 else if(now>=s.nextAt){g.start();s.nextAt=null;}
 }else if(s.members[g.turn]?.bot){g.act(g.ai(s.difficulty??1));}
 s.game=g;
}
export function view(state:any,uid:string,version:number){
 const seat=state.members.findIndex((m:any)=>m.id===uid);if(seat<0)fail('Not a member');
 const g=state.game?JSON.parse(JSON.stringify(state.game)):null;
 if(g){delete g.deck;g.players.forEach((p:any,i:number)=>{p.cards=p.cards.map((c:number,j:number)=>i===seat||(!p.fold&&g.finished&&state.reason!=='Last player connected')||(g.stud&&j>=2&&j<6)?c:-1)});}
 return {code:state.code,host:state.host===uid,members:state.members.map((m:any)=>({name:m.name,bot:!!m.bot,connected:connected(m,Date.now())})),seat,game:g,variant:state.variant,mode:state.mode||'fixed',version,aiCount:state.aiCount||0,cooldownSeconds:state.cooldownSeconds??5,ended:!!state.ended,winner:state.winner,reason:state.reason,nextAt:state.nextAt};
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 // Reject bad passwords before creating an Auth session or accessing the database.
 const b=await readBody(req);if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Invalid request'},400);if(!await allowed(String(b.password||'')))return reply({error:'Access denied. Check the site password.'},403);
 if(b.action==='access')return reply({ok:true});
 const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in first'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return reply({error:'Session expired'},401);
 const uid=user.id;let code=String(b.code||'').toUpperCase();
 const name=String(b.name||'Player').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,18)||'Player';
 if(b.action==='create'){
 if(!Number.isInteger(b.variant)||b.variant<0||b.variant>5)fail('Invalid variant');
 code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
 const aiCount=b.aiCount??0,difficulty=b.difficulty??1;
 if(!Number.isInteger(aiCount)||aiCount<0||aiCount>5)fail('Invalid AI count');if(!Number.isInteger(difficulty)||difficulty<0||difficulty>4)fail('Invalid AI difficulty');
 const mode=b.mode||'fixed';if(!['fixed','no-limit','pot-limit'].includes(mode)||(mode==='no-limit'&&b.variant!==0)||(mode==='pot-limit'&&b.variant!==1))fail('Invalid betting format');
 const cooldownSeconds=b.cooldownSeconds??5;if(!Number.isInteger(cooldownSeconds)||cooldownSeconds<0||cooldownSeconds>120)fail('Cooldown must be between 0 and 120 seconds');
 const state={cooldownSeconds,mode,code,host:uid,members:[{id:uid,name,seen:Date.now()}],variant:b.variant,aiCount,difficulty,game:null};
 const {error}=await db.from('poker_rooms').insert({code,state});if(error)fail('Could not create room');return reply(view(state,uid,0));
 }
 if(!/^[A-Z2-9]{8}$/.test(code))fail('Invalid invitation code');
 const {data:row,error}=await db.from('poker_rooms').select('*').eq('code',code).single();if(error||!row)fail('Room not found');
 const s=row.state;let seat=s.members.findIndex((m:any)=>m.id===uid);
 if(b.action==='join'&&seat<0){if(s.game)fail('The game has already started');if(s.members.length+(s.aiCount||0)>=6)fail('Table is full');s.members.push({id:uid,name,seen:Date.now()});seat=s.members.length-1;}
 else if(seat<0)fail('Join this room first');
 const now=Date.now();s.members[seat].seen=now;s.members[seat].left=b.action==='leave';
 if(!['join','state','leave'].includes(b.action)&&b.version!==row.version)return reply({error:'State changed. Try again.'},409);
 if(b.action==='configure'){
 if(s.host!==uid)fail('Only the host can change the cooldown');const seconds=b.cooldownSeconds;if(!Number.isInteger(seconds)||seconds<0||seconds>120)fail('Cooldown must be between 0 and 120 seconds');
 if(s.nextAt)s.nextAt=s.nextAt-(s.cooldownSeconds??5)*1000+seconds*1000;s.cooldownSeconds=seconds;
 }else if(b.action==='start'||b.action==='next'){
 if(s.ended)fail('Tournament finished. Create a new table.');
 if(s.host!==uid)fail('Only the host can deal');if(s.members.length+(s.aiCount||0)<2)fail('At least two players are required');
 if(b.action==='start'&&s.game)fail('Already started');
 if(b.action==='next'&&(!s.game||!s.game.finished))fail('Finish the current hand');
 if(b.action==='start'){for(let i=0;i<(s.aiCount||0);i++)s.members.push({id:'bot-'+i,name:'AI '+(i+1),bot:true});}
 let g=s.game?Poker.restore(JSON.stringify(s.game)):new Poker(s.members.length-1,s.variant);
 g.mode=s.mode||'fixed';g.players.forEach((p:any,i:number)=>p.name=s.members[i].name);g.start();s.game=g;
 }else if(b.action==='act'){
 if(!s.game||s.game.finished||s.game.turn!==seat)fail('Not your turn');
 if(!['fold','call','raise'].includes(b.move))fail('Invalid move');
 const g=Poker.restore(JSON.stringify(s.game));if(b.move==='raise'&&!g.legal().raise)fail('Raise unavailable');g.act(b.move,b.amount);s.game=g;
 }else if(!['join','state','leave'].includes(b.action))fail('Unknown action');
 tick(s,now);
 const {data:updated,error:writeError}=await db.from('poker_rooms').update({state:s,version:row.version+1,updated_at:new Date().toISOString()}).eq('code',code).eq('version',row.version).select('version').maybeSingle();
 if(writeError)fail('Save failed');if(!updated)return reply({error:'Another player acted. Try again.'},409);
 return reply(view(s,uid,updated.version));
 }catch(e){return reply({error:e instanceof Error?e.message:'Request failed'},e instanceof Error&&e.message==='Request body too large'?413:400)}
});
