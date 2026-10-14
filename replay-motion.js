/* Public actions come from the archived log; canonical frames remain unchanged. */
(function(root){
'use strict';
const M=root.TableMotion,back='<span class="card-back"></span>';
const equal=(a,b)=>a.rank===b.rank&&a.suit===b.suit;
async function run(table,c,index,{rate=1,isCurrent=()=>true}={}){
 const plan=root.PREFER_REPLAY_EVENTS[c.id].groups[index],view=JSON.parse(JSON.stringify(c.steps[index].state)),focal=c.seat,unknown=[];
 const options={channel:'replay',rate},hand=()=>view.players[focal].facedown_cards.hand;
 let label='',seat=focal;
 const name=n=>`Player ${n}`;
 function paint(){
  table.innerHTML=`<div class="turn-banner"><span class="turn-dot"></span>${name(seat)}’s turn<small>Recorded action</small></div><div class="opponents">${view.players.map((p,i)=>i!==focal?opponent(p,i):'').join('')}</div>${tableCenter(view,c.id)}<div class="hand-label">PLAYER ${focal} · OBSERVED HAND</div><div class="hand">${hand().map(x=>card(x)).join('')}${unknown.map(rank=>rank?card({rank,suit:''}):back).join('')}</div><div class="action-callout">${esc(label)}</div>`;
  table.dataset.motionSeat=seat;
  table.querySelectorAll('[data-seat]').forEach(el=>el.classList.toggle('seat-active',Number(el.dataset.seat)===seat));
 }
 function count(player,delta){const p=view.players[player];if(typeof p.public.hand_size==='number')p.public.hand_size+=delta;else if(typeof p.facedown_cards.hand_size==='number')p.facedown_cards.hand_size+=delta;}
 function removeRank(rank,n){let left=n;for(let i=hand().length-1;i>=0&&left;i--)if(hand()[i].rank===rank){hand().splice(i,1);left--;}for(let i=unknown.length-1;i>=0&&left;i--)if(unknown[i]===rank||unknown[i]===null){unknown.splice(i,1);left--;}}
 function update(event){
  const face=view.common.faceup_cards;
  if(event.type==='play'){
   if(seat===focal){const i=hand().findIndex(x=>equal(x,event.card));if(i>=0)hand().splice(i,1);}count(seat,-1);
   if(c.id==='crazy_eights'){face.played_cards.push(event.card);face.target_card=event.card;view.common.current_suit=event.suit||event.card.suit;view.common.declared_suit=event.suit||null;}
   else face.discard_pile.push(event.card);
  }
  if(event.type==='draw'){
   count(seat,1);if(seat===focal){if(event.card)hand().push(event.card);else unknown.push(null);}
   if(event.source==='discard')face.discard_pile.pop();else {const pile=view.common.facedown_cards,key='stock_size' in pile?'stock_size':'deck_size';pile[key]=Math.max(0,pile[key]-1);}
  }
  if(event.type==='transfer'){count(event.from,-event.count);count(seat,event.count);if(event.from===focal)removeRank(event.rank,event.count);if(seat===focal)unknown.push(...Array(event.count).fill(event.rank));}
  if(event.type==='book'){face.books.push({player:seat,rank:event.rank});view.common.total_books++;count(seat,-4);view.players[seat].public.books.push(event.rank);if(seat===focal)removeRank(event.rank,4);}
 }
 for(const record of plan){
  if(!isCurrent())return false;
  seat=record.seat;label=seat===focal?describe(record.action,view):`${name(seat)} · ${record.action.action.replaceAll('_',' ')}`;paint();
  for(const event of record.events){
   if(!isCurrent())return false;
   let a=M.anchors(table,seat,focal),source=null;
   if(event.type==='play'){
    label=`${name(seat)} ${c.id==='gin_rummy'?'discards':'plays'} ${cardName(event.card)}${event.suit?` · ${event.suit}`:''}`;
    if(seat===focal){const i=hand().findIndex(x=>equal(x,event.card));source=table.querySelectorAll('.hand .table-card')[i];}
    table.querySelector('.action-callout').textContent=label;
    await M.play(card(event.card),M.rect(source)||a.hand,a.pile,{...options,stage:seat===focal?null:a.stage,source});
   }else if(event.type==='draw'){
    const shown=event.card&& (seat===focal||event.source==='discard');
    label=`${name(seat)} draws ${shown?cardName(event.card):'one hidden card'}${event.source==='discard'?' from the discard pile':''}`;table.querySelector('.action-callout').textContent=label;
    let slot=null;if(seat===focal){slot=document.createElement('span');slot.className='incoming-card';slot.setAttribute('aria-hidden','true');a.handElement.append(slot);}
    try{await M.draw(shown?card(event.card):back,event.source==='discard'?a.pile:a.stock,M.rect(slot)||a.hand,{...options,known:shown&&event.source==='stock',source:event.source==='discard'?a.pileElement:null});}finally{slot?.remove();}
   }else if(event.type==='ask'){
    label=`${name(seat)} asks ${name(event.target)} for ${event.rank}s`;table.querySelector('.action-callout').textContent=label;await M.pulse(table.querySelector(`[data-seat="${event.target}"]`)||table.querySelector('.hand'),options);await M.pause(180,options);
   }else if(event.type==='transfer'){
    label=`${name(seat)} receives ${event.count} × ${event.rank} from ${name(event.from)}`;table.querySelector('.action-callout').textContent=label;
    const donor=M.anchors(table,event.from,focal),html=card({rank:event.rank,suit:''})+`<span class="transfer-count">×${event.count}</span>`;
    if(event.from!==focal)await M.reveal(html,donor.stage,options);
    if(!isCurrent())return false;await M.flight(html,donor.stage||donor.hand,a.hand,{...options,phase:'transfer'});
   }else if(event.type==='book'){
    label=`${name(seat)} completes ${event.rank} × 4`;table.querySelector('.action-callout').textContent=label;
    await M.flight(card({rank:event.rank,suit:''})+'<span class="transfer-count">×4</span>',a.hand,a.books,{...options,phase:'book'});
   }else {label=`${name(seat)} · ${event.type}`;table.querySelector('.action-callout').textContent=label;await M.pulse(a.handElement,options);await M.pause(350,options);}
   if(!isCurrent())return false;update(event);paint();await M.pause(180,options);
  }
 }
 return isCurrent();
}
root.TableReplay={run};
})(window);
