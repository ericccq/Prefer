/* Faithful browser port of the frozen pilot engines; see data/pilot/*-engine.py.
 * The engine contains no UI, network calls, or model-backed opponents.
 */
(function (root) {
'use strict';
const SUITS=['hearts','diamonds','clubs','spades'];
const clone=x=>JSON.parse(JSON.stringify(x));
function value(c){return c.rank==='8'?50:['K','Q','J','10'].includes(c.rank)?10:c.rank==='A'?1:Number(c.rank);}
function playable(c,s){const g=s.common;return c.rank==='8'||(g.declared_suit!==null?c.suit===g.declared_suit:c.suit===g.faceup_cards.target_card.suit||c.rank===g.faceup_cards.target_card.rank);}
function legal(s,version){
 if(s.common.is_over)return [{action:'pass'}];
 const hand=s.players[s.common.current_player].facedown_cards.hand,actions=[];
 hand.forEach((c,i)=>{if(c.rank==='8')SUITS.forEach(suit=>actions.push({action:'play',args:{card_idx:i,declared_suit:suit}}));else if(playable(c,s))actions.push({action:'play',args:{card_idx:i}});});
 const stock=s.common.facedown_cards.deck.length;
 if(stock>0){if(version==='after'){for(let n=1;n<=Math.min(3,stock);n++)actions.push({action:'draw',args:{draw_count:n}});}else actions.push({action:'draw'});}
 if(!actions.length)actions.push({action:'pass'});
 return actions;
}
function settlePass(s){const g=s.common;g.pass_count++;g.current_player=(g.current_player+1)%g.num_players;if(g.pass_count>=g.num_players){g.is_over=true;const points=s.players.map(p=>p.facedown_cards.hand.reduce((n,c)=>n+value(c),0));g.winner=points.indexOf(Math.min(...points));}}
function put(s,card,suit,seat){const g=s.common;g.faceup_cards.played_cards.push(card);g.faceup_cards.target_card=card;g.pass_count=0;g.declared_suit=card.rank==='8'?suit:null;g.current_suit=card.rank==='8'?suit:card.suit;const p=s.players[seat];p.public.hand_size=p.facedown_cards.hand.length;if(!p.public.hand_size){g.is_over=true;g.winner=seat;}else g.current_player=(seat+1)%g.num_players;}
function step(s,action,version){
 if(!['before','after'].includes(version))throw Error('Unknown rules version');
 if(s.common.is_over)throw Error('This game is over');
 if(!legal(s,version).some(a=>JSON.stringify(a)===JSON.stringify(action)))throw Error('Illegal action');
 const g=s.common,seat=g.current_player,p=s.players[seat],hand=p.facedown_cards.hand,deck=g.facedown_cards.deck;
 if(action.action==='play'){const card=hand.splice(action.args.card_idx,1)[0];put(s,card,action.args.declared_suit,seat);}
 else if(action.action==='draw'&&version==='before'){hand.push(deck.pop());p.public.hand_size=hand.length;}
 else if(action.action==='draw'){
  const count=Math.min(action.args.draw_count,3,deck.length);let played=false;
  for(let i=0;i<count;i++){const c=deck.pop();hand.push(c);p.public.hand_size=hand.length;if(playable(c,s)){hand.pop();put(s,c,'hearts',seat);played=true;break;}}
  if(!played){if(count>=3&&hand.length){const max=Math.max(...hand.map(value)),index=hand.findIndex(c=>value(c)===max);deck.unshift(hand.splice(index,1)[0]);p.public.hand_size=hand.length;g.last_bust={player:seat,buried:true};}settlePass(s);}
 }else if(action.action==='pass')settlePass(s);
 return s;
}
function payoffs(s){const res=s.players.map(()=>0);if(s.common.winner!==null)s.players.forEach((p,i)=>{if(i!==s.common.winner){const n=p.facedown_cards.hand.reduce((a,c)=>a+value(c),0);res[i]=-n;res[s.common.winner]+=n;}});return res;}
function initial(deal){return clone(deal);}
function observe(s,seat=0){const o=clone(s);o.common.facedown_cards={deck_size:s.common.facedown_cards.deck.length};o.players.forEach((p,i)=>{if(i!==seat){delete p.private;p.facedown_cards={hand_size:s.players[i].facedown_cards.hand.length};}});return o;}
function bot(s,version){const a=legal(s,version),plays=a.filter(x=>x.action==='play'),hand=s.players[s.common.current_player].facedown_cards.hand;
 if(plays.length){const normal=plays.filter(x=>hand[x.args.card_idx].rank!=='8');if(normal.length)return normal.reduce((best,x)=>value(hand[x.args.card_idx])>value(hand[best.args.card_idx])?x:best);
 const counts=SUITS.map(suit=>hand.filter(c=>c.suit===suit&&c.rank!=='8').length),suit=SUITS[counts.indexOf(Math.max(...counts))];return plays.find(x=>x.args.declared_suit===suit);}
 return a.find(x=>x.action==='draw')||a[0];
}
const api={SUITS,clone,value,playable,legal,step,payoffs,initial,observe,bot};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CrazyEights=api;
})(typeof window!=='undefined'?window:this);
