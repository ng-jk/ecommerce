import type { Launch } from "./types";

export function nativeBootstrap(launch: Launch): string {
  // The identifier is a short-lived launch correlation value, never a bearer credential.
  const session = JSON.stringify(launch.id);
  const caps = JSON.stringify(launch.capabilities);
  return `(function(){
    const session=${session}, capabilities=${caps}, pending=new Map();
    window.addEventListener('miniapp.response',function(event){
      const data=event.detail;
      if(!data||data.session!==session||!pending.has(data.id))return;
      const slot=pending.get(data.id);pending.delete(data.id);clearTimeout(slot.timer);
      if(data.ok===true)slot.resolve(data.result);else slot.reject(new Error(data.error||'Request failed'));
    });
    function request(capability,input){
      if(!capabilities.includes(capability))return Promise.reject(new Error('Capability unavailable'));
      if(pending.size>=4)return Promise.reject(new Error('Too many requests'));
      const id=crypto.randomUUID();
      return new Promise(function(resolve,reject){
        const timer=setTimeout(function(){pending.delete(id);reject(new Error('Request timed out'))},15000);
        pending.set(id,{resolve:resolve,reject:reject,timer:timer});
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'miniapp.request',session:session,id:id,capability:capability,input:input||{}}));
      });
    }
    window.MiniappSDK=Object.freeze({request:request,catalog:function(page){return request('catalog',{page:page||1})},product:function(id){return request('product',{id:id})},cart:function(){return request('cart.read',{})},orders:function(){return request('orders',{})},loyaltyBalance:function(){return request('plugin.loyalty.balance',{})}});
  })();true;`;
}

export function nativeReplyScript(message: unknown): string {
  return `window.dispatchEvent(new CustomEvent('miniapp.response',{detail:${JSON.stringify(message)}}));true;`;
}
