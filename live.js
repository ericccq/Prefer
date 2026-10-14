(function(){
'use strict';
const E=window.RulebookCrazyEights,M=window.TableMotion,R=window.PREFER_REFINEMENTS;
let version='before',persona='thrill',seed='0',pendingEight=null,pendingSuit=null,running=false,epoch=0;
const sessions={},ruleVersion=()=>version==='before'?'before':R[persona].engine,current=()=>sessions[ruleVersion()];
const beforeRules=[['Draw at your own pace','Draw one card at a time. A playable draw may be kept; you may continue drawing.'],['Play when you choose','Match suit or rank, or play an eight and choose its suit. Drawing remains voluntary.'],['Pass when the stock is empty','Pass only when you have no playable card. A full cycle of passes with an empty stock ends the game.']];
function resetSession(v){const start=E.initialWithEvents(['dilemma','wild','suit'].includes(seed)?E.scenario(seed):E.deal(seed),v);sessions[v]={state:start.state,setupEvents:start.events,setupView:start.view,view:null,history:[],actions:0,last:'',cue:null};}
function cancelRun(){epoch++;M.cancel('live');running=false;pendingEight=null;pendingSuit=null;for(const session of Object.values(sessions)){session.view=null;session.resolvingSeat=null;}}
E.VERSIONS.forEach(resetSession);
const who=seat=>seat===0?'You':`Player ${seat}`;
function eventText(event,old){
 const person=who(event.seat);
 if(event.type==='random_suit')return `Random set-aside suit: ${suits[event.suit]} ${event.suit}  shared by all four players.`;
 if(event.type==='choose_suit')return `Suit commitments: ${event.choices.map((s,i)=>`${who(i)} ${suits[s]}`).join('  ')}.`;
 if(event.type==='place')return `${person} automatically set ${cardName(event.card)} aside  +${E.value(event.card)} points.`;
 if(event.type==='play')return `${person} played ${cardName(event.card)}${event.suit?`  declared ${suits[event.suit]} ${event.suit}`:''}${event.dedicated?'  dedication bonus +5':''}.`;
 if(event.type==='burden')return `${person} burdened ${who(event.target)}  draw ${event.count}.`;
 if(event.type==='draw')return `${person} ${event.placed?`drew and automatically set aside ${cardName(event.card)}  +${E.value(event.card)} points`:`drew ${event.seat===0?cardName(event.card):'one hidden card'}`}${ruleVersion()==='after'?`  draw ${event.count} of 3`:event.cause==='burden'?'  burden':''}.`;
 if(event.type==='bust')return `${person} busted after ${event.count} miss${event.count===1?'':'es'}${event.count<3?' as the stock emptied':''}. Choose a highest-value card.`;
 if(event.type==='bury')return `${person} buried ${event.seat===0?cardName(event.card):'one hidden highest-value card'}${event.removed?' outside play':' at the bottom of the stock'}.`;
 if(event.type==='stop')return `${person} stopped after ${old.common.draw_count} miss${old.common.draw_count===1?'':'es'}.`;
 return `${person} passed  no legal card and no stock.`;
}
function cueFor(event){
 if(version==='before')return event.type==='draw'?['Original drawing','Continue drawing or play a card; there is no draw cap.']:null;
 if(persona==='efficiency'&&(event.type==='place'||event.placed))return ['Automatic set-aside','The shared random suit goes straight to the scoring area without using a play action.'];
 if(persona==='social'&&event.type==='burden')return ['Emotional challenge  targeting',`${who(event.seat)} chose ${who(event.target)} to draw. The turn order stays the same.`];
 if(persona==='system'&&event.dedicated)return ['Meaning  commitment','This card advances the suit you committed to and adds five bonus points.'];
 if(persona!=='thrill')return null;
 if(event.type==='bust'||event.type==='bury')return ['Challenge fit  consequence','A bust changes your hand immediately. Choose a highest-value card to bury.'];
 if(event.type==='stop')return ['Autonomy  stopping','You can end the gamble after seeing a miss.'];
 if(event.type==='draw')return ['Challenge fit  decision','Another draw offers a chance to play and moves you closer to a bust.'];
 if(event.suit)return ['Autonomy  wild suit','Choose the next suit yourself.'];
 return null;
}
function placement(table,seat){return table.querySelector(`[data-set-aside="${seat}"] .set-aside-cards`);}
async function resolve(action,token){
 const session=current(),s=session.state,old=E.clone(s),seat=s.common.current_player;
 const events=E.step(s,action,ruleVersion());session.actions++;session.resolvingSeat=seat;
 await present(events,session,old,token);
}
async function present(events,session,old,token){
 for(const event of events)session.history.push(eventText(event,old));
 session.view=old;session.last='Resolving cards…';renderLive();
 for(const event of events){
  if(token!==epoch)return;
  session.resolvingSeat=event.seat;session.last=eventText(event,old);renderLive();
  const t=$('#live-table'),from=M.anchors(t,event.seat),back='<span class="card-back"></span>';
  if(event.type==='draw'){
   const known=event.seat===0||event.placed,destination=event.placed?placement(t,event.seat):from.handElement;
   let slot=null;if(destination&&(event.seat===0||event.placed)){slot=document.createElement('span');slot.className='incoming-card';slot.setAttribute('aria-hidden','true');destination.append(slot);}
   try{await M.draw(known?card(event.card):back,from.stock,M.rect(slot)||from.hand,{known});}finally{slot?.remove();}
  }
  if(event.type==='play'){
   const source=event.seat===0?t.querySelectorAll('.hand .table-card')[event.index]:null;
   await M.play(card(event.card),M.rect(source)||from.hand,from.pile,{stage:event.seat===0?null:from.stage,source});
  }
  if(event.type==='place'){
   const source=event.seat===0?t.querySelectorAll('.hand .table-card')[event.index]:null,destination=placement(t,event.seat),slot=document.createElement('span');slot.className='incoming-card';slot.setAttribute('aria-hidden','true');destination.append(slot);
   try{if(event.seat!==0)await M.reveal(card(event.card),from.stage);await M.flight(card(event.card),event.seat===0?M.rect(source):from.stage,M.rect(slot),{phase:'set-aside',source});}finally{slot.remove();}
  }
  if(event.type==='bury')await M.flight(back,from.cards[event.index]||from.hand,from.stock,{phase:'bury',source:event.seat===0?t.querySelectorAll('.hand .table-card')[event.index]:null});
  if(event.type==='bust')await M.pulse($('#draw-meter'));
  if(['pass','stop','choose_suit','burden','random_suit'].includes(event.type))await M.pause(500);
  if(token!==epoch)return;
  session.view=event.view;
  const cue=cueFor(event);if(cue&&(event.seat===0||!session.cue||event.type==='burden'))session.cue=cue;
  renderLive();if(event.type==='draw'||event.type==='place')await M.pause(170);
 }
 if(token!==epoch)return;
 session.view=null;renderLive();await M.pause(260);
}
async function botsUntilHuman(token){let n=0;while(token===epoch&&!current().state.common.is_over&&current().state.common.current_player!==0){if(n++>300)throw Error('Rule bot turn limit');await resolve(E.bot(current().state,ruleVersion()),token);}}
async function run(action,auto=false){
 if(running)return;running=true;pendingEight=null;pendingSuit=null;const token=epoch;renderLive();
 try{
  const session=current();if(session.setupEvents.length){const events=session.setupEvents;session.setupEvents=[];await present(events,session,session.setupView,token);if(token!==epoch)return;}
  if(auto){let n=0;do{if(n++>150)throw Error('Rule bot draw limit');await resolve(E.bot(current().state,ruleVersion()),token);}while(token===epoch&&!current().state.common.is_over&&current().state.common.current_player===0);}
  else if(action)await resolve(action,token);
  await botsUntilHuman(token);
 }catch(error){if(token===epoch){current().last=`Play stopped: ${error.message}`;console.error(error);}}
 finally{if(token===epoch){running=false;current().resolvingSeat=null;current().view=null;renderLive();}}
}
function setAside(p,seat){const placed=p.faceup_cards?.placed||[];return `<div class="set-aside" data-set-aside="${seat}"><span>Set aside  ${p.public.placed_points||0} points</span><div class="set-aside-cards">${placed.map(c=>card(c)).join('')}</div></div>`;}
function suitBadge(p){if(!p.public.dedicated_suit)return '';return `<div class="suit-progress"><span>${suits[p.public.dedicated_suit]} ${persona==='system'?'Dedicated':'Signature'} suit</span>${persona==='system'?`<b>${p.public.dedication_count} played  +${p.public.dedication_count*5} points</b>`:''}</div>`;}
function opponentView(p,seat){const feature=version==='after'&&['efficiency','system'].includes(persona)?(persona==='system'?suitBadge(p):setAside(p,seat)):'';return opponent(p,seat,true).replace('<div class="seat-reveal-slot"',feature+'<div class="seat-reveal-slot"');}
function evaluation(){
 const config=R[persona];$('#refinement-persona').textContent=config.persona;
 $('#refinement-target').innerHTML=`<span>${config.dimension}</span><strong>${config.target?`${config.target[0]} <span>→</span> ${config.target[1]}<small>/5</small>`:'Pending'}</strong>`;
 $('#refinement-score').innerHTML=`<span>Post-play preference</span><strong>${config.preference?`${config.preference[0]} <span>→</span> ${config.preference[1]}<small>/10</small>`:'Pending'}</strong>`;
 $('#feedback-heading').textContent=config.pending?'Updated rule  awaiting evaluation':'What the dimension evaluation changed';
 $('#feedback-comparison').innerHTML=config.feedback.map(([text,score,result],i)=>`<div class="feedback-row ${i===config.feedback.length-1?'accepted':''}"><span>${text}</span><b>${score}</b><small>${result.split('\u00b7')[0].trim()}</small></div>`).join('');
 $('#pilot-details').hidden=persona!=='thrill';$('#refinement-record').href=config.record;
}
function renderLive(){
 const session=current(),s=session.view||session.state,g=s.common,over=g.is_over,obs=E.observe(s,0),myTurn=g.current_player===0,legal=myTurn&&!over&&!running?E.legal(s,ruleVersion()):[],hand=obs.players[0].facedown_cards.hand,config=R[persona];
 for(const v of ['before','after']){$(`#version-${v}`).classList.toggle('active',version===v);$(`#version-${v}`).setAttribute('aria-pressed',version===v);}
 $('#persona-picker').querySelectorAll('[data-persona]').forEach(button=>{const active=button.dataset.persona===persona;button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);});
 $('#version-after').setAttribute('aria-label',`Refined rules: ${config.title}`);$('#session-label').textContent=`${session.actions} actions`;
 $('#rules-title').textContent=version==='before'?'Original rules':`${config.title} rules`;
 $('#rules-summary').innerHTML=(version==='before'?beforeRules:config.rules).map(([title,desc],i)=>`<div class="rule-item"><span>${i+1}</span><div><b>${title}</b><p>${desc}</p></div></div>`).join('');
 $('#variant-rulebook').href=config.rulebook;$('#variant-rulebook').textContent=config.title+' rules ↗';evaluation();
 const displaySeat=running?(session.resolvingSeat??g.current_player):g.current_player,table=$('#live-table');
 table.dataset.version=version;table.dataset.persona=persona;table.dataset.actions=session.actions;table.dataset.seed=seed;table.dataset.busy=String(running);table.setAttribute('aria-busy',String(running));
 if(over){const pays=E.payoffs(s),wins=g.winners;table.innerHTML=`<div class="terminal-panel"><div class="eyebrow">GAME POINTS</div><h3 class="terminal-title">${wins.length>1?`${wins.map(who).join(' & ')} share the win.`:wins[0]===0?'You win.':`${who(wins[0])} wins.`}</h3><p>${g.end_reason==='empty_hand'?'The winning hand is empty.':`Empty stock; a full cycle of passes. Lowest ${persona==='system'&&version==='after'?'adjusted ':''}hand value wins.`}</p><div class="payoff-grid">${pays.map((p,i)=>`<div>${who(i)}<b>${p>0?'+':''}${Number.isInteger(p)?p:p.toFixed(1)}</b>${version==='after'&&persona==='system'?`<small>Dedication +${obs.players[i].public.dedication_count*5}</small>`:version==='after'&&persona==='efficiency'?`<small>Set-aside +${obs.players[i].public.placed_points}</small>`:''}</div>`).join('')}</div>${version==='after'&&persona==='efficiency'?'<p class="payoff-note">Your set-aside points + game payoff  winner collects × 2</p>':''}</div>`;}
 else {
  const force=g.forced_index!==null&&myTurn,setup=g.setup_pending,ownFeature=version==='after'&&persona==='system'?suitBadge(obs.players[0]):version==='after'&&persona==='efficiency'?`<div class="suit-progress shared-suit"><span>Random set-aside suit  ${suits[g.excluded_suit]} ${g.excluded_suit}</span><b>All players  automatic</b></div>`:'';
  table.innerHTML=`<div class="turn-banner"><span class="turn-dot"></span>${setup?'Choose your suit':displaySeat===0?'Your turn':`${who(displaySeat)}’s turn`}<small>${running?'Resolving cards…':setup?'Commit before playing':g.pending_bust?'Choose a bust card':force?'Play the drawn eight':'Match suit or rank'}</small></div><div class="opponents">${obs.players.slice(1).map((p,i)=>opponentView(p,i+1)).join('')}</div>${tableCenter(obs,'crazy_eights')}${ownFeature}<div class="hand-label">YOUR HAND</div><div class="hand">${hand.map((c,i)=>card(c,{button:true,index:i,actionName:g.pending_bust?'Bury':'Play',legal:!running&&legal.some(a=>['play','bury'].includes(a.action)&&a.args.card_idx===i)})).join('')}</div>${version==='after'&&persona==='efficiency'?setAside(obs.players[0],0):''}<div class="draw-meter" id="draw-meter"><span>${ruleVersion()==='after'?'Gamble this turn':'Draws this turn'}</span>${ruleVersion()==='after'?[1,2,3].map(n=>`<i class="${n<=g.draw_count?'filled':''}">${n}</i>`).join(''):g.draw_count}<small>${ruleVersion()==='after'?'third miss = bust':persona==='efficiency'&&version==='after'?'shared suit → points':'no cap'}</small></div>`;
  table.querySelectorAll('[data-seat]').forEach(el=>el.classList.toggle('seat-active',Number(el.dataset.seat)===displaySeat));
  table.querySelectorAll('[data-card-index]').forEach(b=>b.addEventListener('click',()=>{if(running)return;const choices=legal.filter(a=>['play','bury'].includes(a.action)&&a.args.card_idx===Number(b.dataset.cardIndex));if(choices.length>1){pendingEight=Number(b.dataset.cardIndex);pendingSuit=null;renderLive();$('#live-actions [data-suit]')?.focus({preventScroll:true});}else if(choices[0])run(choices[0]);}));
 }
 const status=over?'Restart this deal or compare the original.':running?session.last||'Resolving this action…':g.setup_pending?`Choose your ${persona==='system'?'dedicated':'signature'} suit from the four buttons below.`:g.pending_bust?'Bust. Select a highlighted highest-value card.':g.forced_index!==null?'You drew a playable eight. Choose its suit to finish the turn.':pendingSuit!==null?'Choose the opponent who will draw two cards.':pendingEight!==null?'Choose the suit for your eight.':ruleVersion()==='after'&&g.draw_count>0?`${g.draw_count} miss${g.draw_count===1?'':'es'}. Stop now or draw the next card.`:ruleVersion()==='after'?'Play a highlighted card, or draw the first card of a gamble.':'Play a highlighted card, or draw one and choose again.';
 $('#live-instruction').textContent=status;$('#auto-turn').disabled=over||running||!myTurn;
 if(over){$('#live-actions').innerHTML='<button id="new-round">Play this deal again ↺</button>';$('#new-round').addEventListener('click',()=>{cancelRun();resetSession(ruleVersion());renderLive();resume();});}
 else if(running){$('#live-actions').innerHTML='';}
 else if(g.setup_pending){$('#live-actions').innerHTML=`<div class="suit-choice"><strong>Choose your ${persona==='system'?'dedicated':'signature'} suit</strong>${E.SUITS.map(suit=>`<button data-commit-suit="${suit}" aria-label="Choose ${suit}">${suits[suit]} ${suit}</button>`).join('')}</div>`;$('#live-actions').querySelectorAll('[data-commit-suit]').forEach(b=>b.addEventListener('click',()=>run(legal.find(a=>a.args.suit===b.dataset.commitSuit))));}
 else if(pendingEight!==null||g.forced_index!==null){
  const index=g.forced_index??pendingEight;
  if(pendingSuit!==null){$('#live-actions').innerHTML=`<div class="burden-choice"><strong>Who draws two?</strong>${[1,2,3].map(seat=>`<button data-burden-seat="${seat}">Player ${seat}  ${obs.players[seat].public.hand_size} cards</button>`).join('')}<button id="cancel-suit">Back</button></div>`;$('#live-actions').querySelectorAll('[data-burden-seat]').forEach(b=>b.addEventListener('click',()=>run(legal.find(a=>a.action==='play'&&a.args.card_idx===index&&a.args.declared_suit===pendingSuit&&a.args.burden_seat===Number(b.dataset.burdenSeat)))));}
  else {$('#live-actions').innerHTML=`<div class="suit-choice"><strong>Choose the next suit</strong>${E.allowedSuits(s,ruleVersion()).map(suit=>`<button data-suit="${suit}" aria-label="Declare ${suit}">${suits[suit]}</button>`).join('')}${g.forced_index===null?'<button id="cancel-suit">Cancel</button>':''}</div>`;$('#live-actions').querySelectorAll('[data-suit]').forEach(b=>b.addEventListener('click',()=>{if(ruleVersion()==='social'){pendingSuit=b.dataset.suit;renderLive();}else run(legal.find(a=>a.action==='play'&&a.args.card_idx===index&&a.args.declared_suit===b.dataset.suit));}));}
  $('#cancel-suit')?.addEventListener('click',()=>{if(pendingSuit!==null)pendingSuit=null;else pendingEight=null;renderLive();});
 }else {const other=legal.filter(a=>!['play','bury'].includes(a.action));$('#live-actions').innerHTML=other.map((a,i)=>`<button data-action-index="${i}" class="${ruleVersion()==='after'&&g.draw_count===2&&a.action==='draw'?'risk':''}">${a.action==='draw'?(ruleVersion()!=='after'?'Draw one card':g.draw_count===0?'Draw first card':g.draw_count===2?'Draw third card  bust risk':'Draw next card'):a.action==='stop'?'Stop drawing  end turn':'Pass'}</button>`).join('');$('#live-actions').querySelectorAll('[data-action-index]').forEach(b=>b.addEventListener('click',()=>run(other[Number(b.dataset.actionIndex)])));}
 $('#mechanic-cue').innerHTML=session.cue?`<b>${session.cue[0]}</b><span>${session.cue[1]}</span>`:'';
 $('#game-log').innerHTML=session.history.length?session.history.map(t=>`<li>${esc(t)}</li>`).join(''):'<li>New round. You are Player 0; opponents are rule bots.</li>';
}
function showVersion(v){cancelRun();version=v;renderLive();resume();}
function resume(){const session=current(),g=session.state.common;if(session.setupEvents.length||!g.is_over&&g.current_player!==0)run(null);}
$('#version-before').addEventListener('click',()=>showVersion('before'));
$('#version-after').addEventListener('click',()=>showVersion('after'));
$('#persona-picker').querySelectorAll('[data-persona]').forEach(button=>button.addEventListener('click',()=>{cancelRun();persona=button.dataset.persona;version='after';renderLive();resume();}));
$('#persona-picker').addEventListener('keydown',e=>{const buttons=[...e.currentTarget.querySelectorAll('[data-persona]')],index=buttons.indexOf(e.target);if(index<0)return;let next;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(index+1)%buttons.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].click();});
$('#reset-game').addEventListener('click',()=>{cancelRun();resetSession(ruleVersion());renderLive();resume();});
$('#deal-select').addEventListener('change',e=>{cancelRun();seed=e.target.value;E.VERSIONS.forEach(resetSession);renderLive();resume();});
$('#auto-turn').addEventListener('click',()=>run(null,true));
$('#pilot-feedback').textContent='“'+D.pilot.feedback.blinded_evaluator_evidence[1]+'”';
const previewParams=new URLSearchParams(location.search);
if(R[previewParams.get('persona')])persona=previewParams.get('persona');
if(previewParams.get('version')==='after')version='after';
renderLive();resume();
if(previewParams.get('demo')==='refinement'){$('#refinement-demo .demo-disclosure').open=true;requestAnimationFrame(()=>(previewParams.has('persona')?$('#refinement-demo .live-toolbar'):$('#live-table')).scrollIntoView({block:'start'}));}
})();
