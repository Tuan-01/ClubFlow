/* ClubFlow shared prototype data: one campaign, one timeline, read by all three screens. */
window.CF=(function(){
 var K={campaign:"clubflow-campaign",draft:"clubflow-campaign-draft",apps:"clubflow.applications.v1",sched:"clubflow.schedule.v1"};
 function rd(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
 function wr(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
 function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
 function dt(s){return new Date(s+"T00:00:00")}
 return{K:K,read:rd,write:wr,
  campaign:function(){var c=rd(K.campaign);return c&&c.published?c:null},
  confirmed:function(){var s=rd(K.sched);return!!(s&&s.confirmed)},
  isClosed:function(c){return!!c.closedEarly||iso(new Date())>c.closing},
  fmt:function(s){return dt(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})},
  addDays:function(s,n){var d=dt(s);d.setDate(d.getDate()+n);return iso(d)},
  days:function(a,b){return Math.round((dt(b)-dt(a))/864e5)},
  posMap:function(c){var o={};c.positions.forEach(function(p,i){o[i]=p.title});return o},
  gate:function(t,m,href,label){document.querySelector("main").innerHTML='<div style="max-width:520px;margin:48px auto;background:#fff;border:1px solid #e6e7f0;border-radius:14px;padding:28px;text-align:center"><h1 style="font-size:22px;margin:0 0 8px;display:block">'+t+'</h1><p style="color:#6b6f8a;margin:0 0 16px">'+m+'</p><a href="'+href+'" style="display:inline-block;background:#4a4fa3;color:#fff;border-radius:8px;padding:10px 16px;text-decoration:none;font-weight:700">'+label+'</a></div>'},
  reset:function(){Object.keys(K).forEach(function(k){try{localStorage.removeItem(K[k])}catch(e){}})}
 }})();
