'use strict';
// One worker at a time, cancellable between chunks. New input supersedes old
// work. flush() waits for the newest job including its Photoshop write.
class LiveController {
  constructor(run, {delay=100, onError=()=>{}, onState=()=>{}}={}) {
    this.run=run;this.delay=delay;this.onError=onError;this.onState=onState;
    this.revision=0;this.applied=0;this.pending=null;this.running=false;
    this.closed=false;this.timer=null;this.wake=null;this.waiters=[];this.error=null;this.force=false;
  }
  request(job) {
    if(this.closed) throw Error('Sesión de vista cerrada.');
    this.pending={job,revision:++this.revision};this.error=null;
    if(this.wake) this.wake();
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;this.kick();},this.delay);
    return this.revision;
  }
  async kick() {
    if(this.running||this.closed||!this.pending)return;
    clearTimeout(this.timer);this.timer=null;this.running=true;
    const item=this.pending;this.pending=null;
    const current=()=>!this.closed&&item.revision===this.revision;
    const check=()=>{if(!current()){const e=Error('Actualización reemplazada.');e.superseded=true;throw e;}};
    const pause=ms=>new Promise(resolve=>{
      if(this.force||!current())return resolve();
      let timer;
      const done=()=>{clearTimeout(timer);if(this.wake===done)this.wake=null;resolve();};
      this.wake=done;timer=setTimeout(done,ms);
    });
    this.onState('working');
    try {await this.run(item.job,{current,check,pause});if(current())this.applied=item.revision;}
    catch(e) {if(current()){this.error=e;this.onError(e);}}
    finally {
      this.running=false;
      if(this.pending&&!this.closed) {
        if(this.force||!this.timer)this.kick();
      } else {
        this.onState(this.error?'error':'idle');
        const waiters=this.waiters.splice(0);for(const resolve of waiters)resolve();
      }
    }
  }
  async flush() {
    if(this.closed)throw Error('Sesión de vista cerrada.');
    this.force=true;clearTimeout(this.timer);this.timer=null;if(this.wake)this.wake();
    const done=new Promise(resolve=>this.waiters.push(resolve));
    if(!this.running&&this.pending)this.kick();
    else if(!this.running){this.waiters.pop();this.force=false;if(this.error)throw this.error;return;}
    await done;this.force=false;
    if(this.error)throw this.error;
    if(this.applied!==this.revision)throw Error('La última actualización no se completó.');
  }
  async dispose() {
    this.closed=true;this.revision++;this.pending=null;clearTimeout(this.timer);this.timer=null;
    if(this.wake)this.wake();
    if(this.running)await new Promise(resolve=>this.waiters.push(resolve));
  }
}
module.exports={LiveController};
