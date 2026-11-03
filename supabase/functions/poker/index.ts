import { createClient } from 'npm:@supabase/supabase-js@2';
import { Poker } from './engine.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message:string)=>{throw new Error(message)};
export function view(state:any,uid:string,version:number){
 const seat=state.members.findIndex((m:any)=>m.id===uid);if(seat<0)fail('Not a member');
 const g=state.game?JSON.parse(JSON.stringify(state.game)):null;
 if(g){delete g.deck;g.players.forEach((p:any,i:number)=>{p.cards=p.cards.map((c:number,j:number)=>i===seat||(!p.fold&&g.finished)||(g.stud&&j>=2&&j<6)?c:-1)});}
 return {code:state.code,host:state.host===uid,members:state.members.map((m:any)=>({name:m.name})),seat,game:g,variant:state.variant,version};
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in first'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return reply({error:'Session expired'},401);
 const b=await req.json();const uid=user.id;let code=String(b.code||'').toUpperCase();
 const name=String(b.name||'Player').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,18)||'Player';
 if(b.action==='create'){
 if(!Number.isInteger(b.variant)||b.variant<0||b.variant>5)fail('Invalid variant');
 code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
 const state={code,host:uid,members:[{id:uid,name}],variant:b.variant,game:null};
 const {error}=await db.from('poker_rooms').insert({code,state});if(error)fail('Could not create room');return reply(view(state,uid,0));
 }
 if(!/^[A-Z2-9]{8}$/.test(code))fail('Invalid invitation code');
 const {data:row,error}=await db.from('poker_rooms').select('*').eq('code',code).single();if(error||!row)fail('Room not found');
 const s=row.state;let seat=s.members.findIndex((m:any)=>m.id===uid);
 if(b.action==='join'&&seat<0){if(s.game)fail('The game has already started');if(s.members.length>=6)fail('Table is full');s.members.push({id:uid,name});seat=s.members.length-1;}
 else if(seat<0)fail('Join this room first');
 if(b.action==='state')return reply(view(s,uid,row.version));
 if(b.action!=='join'&&b.version!==row.version)return reply({error:'State changed. Try again.'},409);
 if(b.action==='start'||b.action==='next'){
 if(s.host!==uid)fail('Only the host can deal');if(s.members.length<2)fail('At least two players are required');
 if(b.action==='start'&&s.game)fail('Already started');
 if(b.action==='next'&&(!s.game||!s.game.finished))fail('Finish the current hand');
 let g=s.game?Poker.restore(JSON.stringify(s.game)):new Poker(s.members.length-1,s.variant);
 g.players.forEach((p:any,i:number)=>p.name=s.members[i].name);g.start();s.game=g;
 }else if(b.action==='act'){
 if(!s.game||s.game.finished||s.game.turn!==seat)fail('Not your turn');
 if(!['fold','call','raise'].includes(b.move))fail('Invalid move');
 const g=Poker.restore(JSON.stringify(s.game));if(b.move==='raise'&&!g.legal().raise)fail('Raise unavailable');g.act(b.move);s.game=g;
 }else if(b.action!=='join')fail('Unknown action');
 const {data:updated,error:writeError}=await db.from('poker_rooms').update({state:s,version:row.version+1,updated_at:new Date().toISOString()}).eq('code',code).eq('version',row.version).select('version').maybeSingle();
 if(writeError)fail('Save failed');if(!updated)return reply({error:'Another player acted. Try again.'},409);
 return reply(view(s,uid,updated.version));
 }catch(e){return reply({error:e instanceof Error?e.message:'Request failed'},400)}
});
