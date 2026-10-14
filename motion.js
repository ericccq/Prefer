/* Presentation only: one travel speed, ordered actions, cancellable channels. */
(function(root){
'use strict';
const jobs=new Set(),SPEED=420,systemMotion=matchMedia('(prefers-reduced-motion: reduce)'),toggle=document.querySelector('#motion-toggle');
let explicitMotion=new URLSearchParams(location.search).get('motion')==='on';
if(toggle)toggle.checked=explicitMotion||!systemMotion.matches;
const reduced=()=>toggle?!toggle.checked:systemMotion.matches;
const rect=el=>el?.getBoundingClientRect();
const valid=r=>r&&r.width>0&&r.height>0;
function cancel(channel){for(const job of [...jobs])if(!channel||job.channel===channel)job.stop();}
function pause(ms,{channel='live',rate=1}={}){
 if(reduced()||!ms)return Promise.resolve(true);
 return new Promise(resolve=>{const finish=ok=>{clearTimeout(id);jobs.delete(job);resolve(ok);},job={channel,stop:()=>finish(false)},id=setTimeout(()=>finish(true),ms/rate);jobs.add(job);});
}
async function animate(el,frames,duration,{channel='live',easing='linear'}={}){
 const a=el.animate(frames,{duration,easing,fill:'forwards'}),job={channel,stop:()=>a.cancel()};jobs.add(job);
 try{await a.finished;return true;}catch{return false;}finally{jobs.delete(job);a.cancel();}
}
function carrier(html,at,{channel='live',width=55,height=77,phase='move'}={}){
 const el=document.createElement('div');el.className='flying-card';el.dataset.channel=channel;el.dataset.phase=phase;el.setAttribute('aria-hidden','true');el.innerHTML=html;
 Object.assign(el.style,{left:`${at.x+at.width/2-width/2}px`,top:`${at.y+at.height/2-height/2}px`,width:`${width}px`,height:`${height}px`});document.body.append(el);return el;
}
async function flight(html,from,to,{channel='live',rate=1,phase='move',source}={}){
 if(reduced()||!valid(from)||!valid(to))return true;
 const width=Math.min(58,from.width>80?55:from.width),height=from.width>80?77:Math.min(90,from.height),el=carrier(html,from,{channel,width,height,phase});
 const targetWidth=Math.min(58,to.width>80?55:to.width),targetHeight=to.width>80?77:Math.min(90,to.height);
 const dx=to.x+to.width/2-(from.x+from.width/2),dy=to.y+to.height/2-(from.y+from.height/2),distance=Math.hypot(dx,dy),duration=distance/SPEED*1000/rate;
 el.dataset.distance=distance.toFixed(2);el.dataset.duration=duration.toFixed(2);el.dataset.speed=String(SPEED*rate);
 const hidden=source?.style.visibility;if(source)source.style.visibility='hidden';
 try{return await animate(el,[{transform:'translate(0,0) scale(1,1)'},{transform:`translate(${dx}px,${dy}px) scale(${targetWidth/width},${targetHeight/height})`}],Math.max(1,duration),{channel});}
 finally{el.remove();if(source)source.style.visibility=hidden;}
}
async function reveal(html,at,{channel='live',rate=1,flip=false}={}){
 if(reduced()||!valid(at))return true;
 const width=Math.min(58,at.width>80?55:at.width),height=at.width>80?77:Math.min(90,at.height),el=carrier(flip?'<span class="card-back"></span>':html,at,{channel,width,height,phase:flip?'flip':'reveal'});
 try{
  if(flip){if(!await animate(el,[{transform:'scaleX(1)'},{transform:'scaleX(0)'}],140/rate,{channel}))return false;el.innerHTML=html;if(!await animate(el,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],140/rate,{channel}))return false;}
  return await pause(flip?100:280,{channel,rate});
 }finally{el.remove();}
}
async function play(html,from,pile,{stage,source,...options}={}){
 if(stage&&!await reveal(html,stage,options))return false;
 return flight(html,stage||from,pile,{...options,source:stage?null:source,phase:'play'});
}
async function draw(html,stock,hand,{known=false,source,...options}={}){
 if(known&&!await reveal(html,stock,{...options,flip:true}))return false;
 return flight(html,stock,hand,{...options,source,phase:'draw'});
}
async function pulse(el,{channel='live',rate=1}={}){if(reduced()||!el)return true;return animate(el,[{boxShadow:'0 0 0 0 #d5a45300'},{boxShadow:'0 0 0 5px #d5a45388'},{boxShadow:'0 0 0 0 #d5a45300'}],220/rate,{channel});}
function anchors(table,seat,focal=0){
 const opponent=table.querySelector(`[data-seat="${seat}"]`),hand=table.querySelector(seat===focal?'.hand':`[data-seat="${seat}"] .mini-backs`),pile=table.querySelector('[data-pile="played"] .table-card'),slot=opponent?.querySelector('.seat-reveal-slot');
 return {hand:rect(seat===focal?hand:hand?.querySelector('.card-back:last-child'))||rect(hand),cards:seat===focal?[...table.querySelectorAll('.hand .table-card')].map(rect):[],handElement:hand,pile:rect(pile)||rect(table.querySelector('[data-pile="played"] .empty-pile')),pileElement:pile,stock:rect(table.querySelector('[data-pile="stock"] .card-back')),stockElement:table.querySelector('[data-pile="stock"] .card-back'),stage:rect(slot),books:rect(table.querySelector('.book-list'))};
}
root.TableMotion={SPEED,rect,anchors,flight,reveal,play,draw,pulse,pause,cancel,reduced};
toggle?.addEventListener('change',()=>{explicitMotion=true;if(reduced())cancel();});
systemMotion.addEventListener('change',()=>{if(!explicitMotion&&toggle){toggle.checked=!systemMotion.matches;if(reduced())cancel();}});
})(window);
