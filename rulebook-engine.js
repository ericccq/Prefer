/* Browser playtest: the archived prose rulebooks are authoritative.
 * engine.js remains the unmodified experimental-engine reproduction.
 * Ambiguous exhaustion/burial and shared-win conventions are disclosed in the UI.
 */
(function(root){
'use strict';
const SUITS=['hearts','diamonds','clubs','spades'];
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const VERSIONS=['before','after','efficiency','social','system'];
const clone=x=>JSON.parse(JSON.stringify(x));
const value=c=>c.rank==='8'?50:['K','Q','J','10'].includes(c.rank)?10:c.rank==='A'?1:Number(c.rank);
const same=(a,b)=>a.rank===b.rank&&a.suit===b.suit;
function playable(c,s){const g=s.common;return c.rank==='8'||(g.declared_suit?c.suit===g.declared_suit:c.suit===g.faceup_cards.target_card.suit||c.rank===g.faceup_cards.target_card.rank);}
function state(hands,deck,top){return {common:{num_players:4,current_player:0,current_suit:top.suit,declared_suit:null,pass_count:0,is_over:false,winner:null,winners:[],end_reason:null,draw_count:0,forced_index:null,pending_bust:false,faceup_cards:{target_card:top,played_cards:[top]},facedown_cards:{deck,removed:[]}},players:hands.map(hand=>({public:{hand_size:hand.length},facedown_cards:{hand}}))};}
function deal(seed=0){
 let n=(Number(seed)>>>0)+0x6d2b79f5;
 const rand=()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const deck=SUITS.flatMap(suit=>RANKS.map(rank=>({rank,suit})));
 for(let i=51;i>0;i--){const j=Math.floor(rand()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 const hands=[[],[],[],[]];for(let r=0;r<5;r++)for(let p=0;p<4;p++)hands[p].push(deck.pop());
 let top=deck.pop();while(top.rank==='8'){deck.splice(Math.floor(deck.length/2),0,top);top=deck.pop();}
 const s=state(hands,deck,top);s.common.deal_seed=Number(seed);return s;
}
// Authored teaching positions, explicitly labelled as such; never historical evidence.
function scenario(kind){
 const pool=SUITS.flatMap(suit=>RANKS.map(rank=>({rank,suit})));
 const take=(rank,suit)=>pool.splice(pool.findIndex(c=>c.rank===rank&&c.suit===suit),1)[0];
 const top=kind==='suit'?take('9','spades'):take('7','hearts');
 const hand=kind==='suit'?[take('10','spades'),take('8','spades'),take('K','clubs'),take('2','diamonds'),take('9','hearts')]:kind==='wild'?[take('K','clubs'),take('4','clubs'),take('2','diamonds'),take('9','spades'),take('J','diamonds')]:[take('8','hearts'),take('8','spades'),take('K','clubs'),take('4','clubs'),take('2','diamonds')];
 const draws=kind==='suit'?[take('Q','spades'),take('7','diamonds'),take('3','clubs')]:kind==='wild'?[take('8','diamonds')]:[take('3','clubs'),take('5','spades'),take('6','clubs')];
 const hands=[hand,[],[],[]];for(let r=0;r<5;r++)for(let p=1;p<4;p++)hands[p].push(pool.pop());
 const s=state(hands,pool.concat(draws.reverse()),top);s.common.deal_seed=kind==='suit'?4:0;return s;
}
function randomSuit(seed){let t=(Number(seed)>>>0)+0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return SUITS[Math.floor((((t^t>>>14)>>>0)/4294967296)*4)];}
function initialWithEvents(input,version='before'){
 const s=clone(input),events=[];s.common.variant=version;s.common.setup_pending=version==='system';s.common.excluded_suit=version==='efficiency'?randomSuit(s.common.deal_seed??0):null;
 s.players.forEach(p=>{p.faceup_cards={placed:[]};p.public.dedicated_suit=null;p.public.dedication_count=0;p.public.placed_points=0;});
 const view=clone(s);
 if(version==='efficiency'){
  events.push({type:'random_suit',seat:0,suit:s.common.excluded_suit,view:clone(s)});
  s.players.forEach((p,seat)=>{
   const hand=p.facedown_cards.hand;
   for(let i=hand.length-1;i>=0;i--)if(hand[i].suit===s.common.excluded_suit){const c=hand.splice(i,1)[0];p.faceup_cards.placed.push(c);p.public.placed_points+=value(c);p.public.hand_size=hand.length;events.push({type:'place',seat,card:c,index:i,setup:true,view:clone(s)});}
  });
  const empty=s.players.flatMap((p,seat)=>p.facedown_cards.hand.length?[]:[seat]);
  if(empty.length){s.common.is_over=true;s.common.winners=empty;s.common.winner=empty[0];s.common.end_reason='empty_hand';}
 }
 return {state:s,events,view};
}
function initial(input,version='before'){return initialWithEvents(input,version).state;}
function bestSuit(hand){return SUITS.reduce((best,suit)=>hand.filter(c=>c.suit===suit).length>hand.filter(c=>c.suit===best).length?suit:best,SUITS[0]);}
function allowedSuits(s,version){return version==='efficiency'?SUITS.filter(suit=>suit!==s.common.excluded_suit):SUITS;}
function playActions(s,indices,version){const seat=s.common.current_player,hand=s.players[seat].facedown_cards.hand;return indices.flatMap(i=>hand[i].rank==='8'?allowedSuits(s,version).flatMap(suit=>version==='social'?s.players.flatMap((p,target)=>target===seat?[]:[{action:'play',args:{card_idx:i,declared_suit:suit,burden_seat:target}}]):[{action:'play',args:{card_idx:i,declared_suit:suit}}]):[{action:'play',args:{card_idx:i}}]);}
function legal(s,version){
 if(!VERSIONS.includes(version))throw Error('Unknown rules version');
 const g=s.common;if(g.is_over)return [];
 if(g.setup_pending)return SUITS.map(suit=>({action:'choose_suit',args:{suit}}));
 const hand=s.players[g.current_player].facedown_cards.hand,stock=g.facedown_cards.deck.length;
 if(g.pending_bust){const max=Math.max(...hand.map(value));return hand.flatMap((c,i)=>value(c)===max?[{action:'bury',args:{card_idx:i}}]:[]);}
 if(g.forced_index!==null)return playActions(s,[g.forced_index],version);
 if(version==='after'&&g.draw_count>0)return [...(stock?[{action:'draw'}]:[]),{action:'stop'}];
 const actions=playActions(s,hand.map((c,i)=>playable(c,s)?i:-1).filter(i=>i>=0),version);
 if(stock)actions.push({action:'draw'});
 if(!actions.length)actions.push({action:'pass'});
 return actions;
}
function handPoints(p){return p.facedown_cards.hand.reduce((n,c)=>n+value(c),0);}
function effectivePoints(p,version){return version==='system'?Math.max(0,handPoints(p)-5*p.public.dedication_count):handPoints(p);}
function finishNoPlay(s,version){
 const g=s.common;g.pass_count=g.facedown_cards.deck.length===0?g.pass_count+1:0;
 g.draw_count=0;g.forced_index=null;g.pending_bust=false;
 if(g.pass_count>=g.num_players){const points=s.players.map(p=>effectivePoints(p,version));const min=Math.min(...points);g.winners=points.flatMap((v,i)=>v===min?[i]:[]);g.winner=g.winners[0];g.is_over=true;g.end_reason='exhaustion';}
 else g.current_player=(g.current_player+1)%g.num_players;
}
function finishPlay(s,seat){const g=s.common;if(!s.players[seat].facedown_cards.hand.length){g.is_over=true;g.winner=seat;g.winners=[seat];g.end_reason='empty_hand';}else g.current_player=(seat+1)%g.num_players;}
function put(s,c,suit,seat,deferEnd=false){
 const g=s.common;g.faceup_cards.played_cards.push(c);g.faceup_cards.target_card=c;g.pass_count=0;g.draw_count=0;g.forced_index=null;
 g.declared_suit=c.rank==='8'?suit:null;g.current_suit=c.rank==='8'?suit:c.suit;
 if(!deferEnd)finishPlay(s,seat);
}
function step(s,action,version){
 if(!legal(s,version).some(a=>JSON.stringify(a)===JSON.stringify(action)))throw Error('Illegal action');
 const g=s.common,seat=g.current_player,p=s.players[seat],hand=p.facedown_cards.hand,deck=g.facedown_cards.deck,events=[];
 // Each snapshot is the state after one visible event, so cards arrive before counts change.
 const emit=event=>events.push({...event,view:clone(s)});
 if(action.action==='choose_suit'){
  const choices=s.players.map((other,i)=>i===seat?action.args.suit:bestSuit(other.facedown_cards.hand));
  s.players.forEach((other,i)=>{other.public.dedicated_suit=choices[i];});g.setup_pending=false;
  emit({type:'choose_suit',seat,suit:choices[seat],choices});
  const empty=s.players.flatMap((other,i)=>other.facedown_cards.hand.length?[]:[i]);
  if(empty.length){g.is_over=true;g.winners=empty;g.winner=empty[0];g.end_reason='empty_hand';}
 }
 else if(action.action==='play'){
  const c=hand.splice(action.args.card_idx,1)[0];p.public.hand_size=hand.length;
  const dedicated=version==='system'&&c.rank!=='8'&&c.suit===p.public.dedicated_suit;
  if(dedicated)p.public.dedication_count++;
  const burden=version==='social'&&c.rank==='8';put(s,c,action.args.declared_suit,seat,burden);
  emit({type:'play',seat,card:c,index:action.args.card_idx,suit:action.args.declared_suit,dedicated});
  if(burden){
   const target=action.args.burden_seat,other=s.players[target];emit({type:'burden',seat,target,count:Math.min(2,deck.length)});
   for(let n=0;n<2&&deck.length;n++){const drawn=deck.pop();other.facedown_cards.hand.push(drawn);other.public.hand_size++;emit({type:'draw',seat:target,card:drawn,cause:'burden',count:n+1});}
   finishPlay(s,seat);
  }
 }
 else if(action.action==='draw'){
  const c=deck.pop();g.draw_count++;
  if(version==='efficiency'&&c.suit===g.excluded_suit){
   p.faceup_cards.placed.push(c);p.public.placed_points+=value(c);emit({type:'draw',seat,card:c,count:g.draw_count,placed:true});
  }else{
   hand.push(c);p.public.hand_size=hand.length;emit({type:'draw',seat,card:c,count:g.draw_count});
  }
  if(version==='after'){
   if(playable(c,s)){g.forced_index=hand.length-1;if(c.rank!=='8'){hand.pop();p.public.hand_size=hand.length;put(s,c,null,seat);emit({type:'play',seat,card:c,index:hand.length,drawn:true});}}
   else if(g.draw_count===3||deck.length===0){g.pending_bust=true;emit({type:'bust',seat,count:g.draw_count});}
  }
 }
 else if(action.action==='bury'){
  const c=hand.splice(action.args.card_idx,1)[0],removed=deck.length===0;
  if(removed)g.facedown_cards.removed.push(c);else deck.unshift(c);
  p.public.hand_size=hand.length;emit({type:'bury',seat,card:c,index:action.args.card_idx,removed});finishNoPlay(s,version);
 }else {emit({type:action.action,seat});finishNoPlay(s,version);}
 p.public.hand_size=hand.length;
 return events;
}
function payoffs(s){const out=s.players.map(()=>0),wins=s.common.winners||[],version=s.common.variant;if(!s.common.is_over)return out;s.players.forEach((p,i)=>{if(!wins.includes(i)){const n=effectivePoints(p,version);out[i]=-n;wins.forEach(w=>out[w]+=n/wins.length);}});wins.forEach(w=>{if(version==='efficiency')out[w]*=2;if(version==='system')out[w]+=5*s.players[w].public.dedication_count;});if(version==='efficiency')s.players.forEach((p,i)=>{out[i]+=p.public.placed_points;});return out;}
function observe(s,seat=0){const o=clone(s);o.common.facedown_cards={deck_size:s.common.facedown_cards.deck.length,removed_count:s.common.facedown_cards.removed.length};o.players.forEach((p,i)=>{if(i!==seat)p.facedown_cards={hand_size:s.players[i].facedown_cards.hand.length};});return o;}
function bot(s,version){const a=legal(s,version),g=s.common,hand=s.players[g.current_player].facedown_cards.hand,plays=a.filter(x=>x.action==='play');
 if(g.setup_pending)return a.find(x=>x.args.suit===bestSuit(hand));
 if(version==='system'){
  const dedicated=plays.filter(x=>hand[x.args.card_idx].rank!=='8'&&hand[x.args.card_idx].suit===s.players[g.current_player].public.dedicated_suit);
  if(dedicated.length)return dedicated.reduce((b,x)=>value(hand[x.args.card_idx])>value(hand[b.args.card_idx])?x:b);
 }
 if(plays.length){const normal=plays.filter(x=>hand[x.args.card_idx].rank!=='8');if(normal.length)return normal.reduce((b,x)=>value(hand[x.args.card_idx])>value(hand[b.args.card_idx])?x:b);const choices=allowedSuits(s,version),counts=choices.map(suit=>hand.filter(c=>c.suit===suit&&c.rank!=='8').length),suit=choices[counts.indexOf(Math.max(...counts))];const target=s.players.reduce((best,p,i)=>i===g.current_player?best:best===null||p.facedown_cards.hand.length<s.players[best].facedown_cards.hand.length?i:best,null);return plays.find(x=>x.args.declared_suit===suit&&(version!=='social'||x.args.burden_seat===target));}
 if(a[0]?.action==='bury')return a[0];
 if(g.draw_count>=2&&g.current_player%2===0){const stop=a.find(x=>x.action==='stop');if(stop)return stop;}
 return a.find(x=>x.action==='draw')||a[0];
}
const api={SUITS,VERSIONS,clone,value,same,playable,deal,scenario,legal,step,payoffs,initial,initialWithEvents,allowedSuits,observe,bot};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RulebookCrazyEights=api;
})(typeof window!=='undefined'?window:this);
