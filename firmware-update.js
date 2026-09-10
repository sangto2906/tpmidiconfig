/* TPMidi A/B protocol v1. No private signing material belongs in this file. */
class TPMidiUpdater {
  constructor(send, display, product = () => [0x54, 0x4d], productName = () => 'TPMidi') {
    this.send = send; this.display = display;
    this.product = product; this.productName = productName;
    this.sequence = crypto.getRandomValues(new Uint32Array(1))[0] & 0xfffff;
    this.pending = null; this.cancelled = false; this.busy = false;
  }
  static pack(bytes) {
    const out = [];
    for (let i=0;i<bytes.length;) {
      const h=out.length; out.push(0);
      for(let j=0;j<7 && i<bytes.length;j++,i++) {out[h]|=(bytes[i]>>7)<<j;out.push(bytes[i]&127);}
    }
    return out;
  }
  static unpack(bytes) {
    const out=[];
    for(let i=0;i<bytes.length;) {
      const h=bytes[i++], n=Math.min(7,bytes.length-i);
      if(!n || h>>n) throw new Error('Malformed firmware reply.');
      for(let j=0;j<n;j++) { const b=bytes[i++];if(b&128) throw new Error('Invalid MIDI byte.');out.push(b|(((h>>j)&1)<<7)); }
    }
    return new Uint8Array(out);
  }
  static crc(bytes) {
    let c=0xffffffff;
    for(const b of bytes) {c^=b;for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0);}
    return (~c)>>>0;
  }
  receive(frame) {
    const p=this.pending;
    if(!p || frame.length<10 || frame[4]!==p.command || frame[5]!==1) return;
    const seq=frame[6]|(frame[7]<<7)|(frame[8]<<14);
    if(seq!==p.sequence) return;
    try {
      const bytes=TPMidiUpdater.unpack(frame.slice(9,-1));
      if(bytes.length!==18) throw new Error('Invalid firmware status length.');
      const view=new DataView(bytes.buffer);
      const state={error:bytes[0],slot:bytes[1],confirmed:bytes[2],pending:bytes[3],attempts:bytes[4],
        releases:[view.getUint32(5,true),view.getUint32(9,true)],received:view.getUint32(13,true),healthy:!!bytes[17]};
      p.resolve(state);
    } catch(error) {p.reject(error);}
  }
  disconnect() {
    this.cancelled=true;
    this.pending?.reject(new Error('Disconnected. Transfer stopped.'));
  }
  async request(command,bytes=new Uint8Array()) {
    if(this.pending) throw new Error('Another firmware request is pending.');
    const sequence=this.sequence++ & 0x1fffff;
    const frame=[0xf0,0x7d,...this.product(),command,1,sequence&127,(sequence>>7)&127,(sequence>>14)&127,...TPMidiUpdater.pack(bytes),0xf7];
    let timer;
    try {
      const state=await new Promise((resolve,reject)=> {
        this.pending={command,sequence,resolve,reject};let tries=0;
        const attempt=()=> {
          if(++tries>3) {
            reject(new Error('Firmware response timed out. No restart was sent; disconnect and reconnect, then read the firmware status before trying again.'));
            return;
          }
          try {this.send(frame);} catch(error) {reject(error);return;}
          timer=setTimeout(attempt,4000);
        };attempt();
      });
      this.display(state);
      if(state.error) throw new Error(`Firmware rejected request (error ${state.error}).`);
      return state;
    } finally {clearTimeout(timer);this.pending=null;}
  }
  async upload(file,progress) {
    return this.uploadBytes(new Uint8Array(await file.arrayBuffer()),progress);
  }
  async uploadBytes(bytes,progress) {
    if(this.busy) throw new Error('Update already running.');
    this.busy=true;this.cancelled=false;
    try {
      if(!(bytes instanceof Uint8Array) || bytes.length<110 || bytes.length>110+0xdf000) throw new Error('Invalid update size.');
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(String.fromCharCode(...bytes.slice(0,4))!=='TMIM' || bytes[4]!==1) throw new Error(`Select a signed ${this.productName()} .tmim update.`);
      if(this.productName()==='TPFader' && view.getUint32(6,true)<9) {
        throw new Error('TPFader release 8 and earlier are revoked and cannot be installed. Use release 9 or newer.');
      }
      const state=await this.request(0x40), target=bytes[5], length=view.getUint32(10,true);
      if(!state.healthy || state.pending!==255 || target!==1-state.slot) throw new Error('Image must target the inactive slot of a healthy confirmed device.');
      if(length!==bytes.length-110 || length<0x3008 || length>0xdf000) throw new Error('Invalid firmware bounds.');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice(110)));
      if(!digest.every((b,i)=>b===bytes[14+i])) throw new Error('Firmware SHA-256 mismatch.');
      if(this.cancelled) throw new Error('Update cancelled.');
      await this.request(0x41,bytes.slice(0,110));
      for(let offset=0;offset<length;offset+=256) {
        if(this.cancelled) throw new Error('Update cancelled.');
        const page=bytes.slice(110+offset,110+Math.min(length,offset+256));
        const data=new Uint8Array(8+page.length), v=new DataView(data.buffer);
        v.setUint32(0,offset,true);v.setUint32(4,TPMidiUpdater.crc(page),true);data.set(page,8);
        await this.request(0x42,data);progress(Math.min(length,offset+256)/length);
      }
      if(this.cancelled) throw new Error('Update cancelled.');
      await this.request(0x43);
    } catch(error) {
      // Do not send an automatic abort after a transport timeout.  The last
      // command may already be executing in flash, and recovery must be an
      // explicit, observed action after reconnecting.  No reboot is automatic.
      throw error;
    } finally {this.busy=false;}
  }
}
if(typeof module!=='undefined') module.exports=TPMidiUpdater;
