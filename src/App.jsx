import { useState, useEffect, useRef, useCallback } from "react";

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://vugqkfdweyhdtvovvnci.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Z3FrZmR3ZXloZHR2b3Z2bmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjk0MDgsImV4cCI6MjA4ODkwNTQwOH0.FsLAnELsq1G9ZepOR1ncbuCpDcvHU_0OtVk3aYYwsD4";

const sb = {
  headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  async getItems() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items?order=created_at.desc`, { headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToItem);
  },
  async upsertItem(item) {
    const row = itemToDb(item);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
      method: "POST",
      headers: { ...this.headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    const [saved] = await r.json();
    return dbToItem(saved);
  },
  async deleteItem(id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items?id=eq.${id}`, { method: "DELETE", headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
  },
  async getFields() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/custom_fields?order=sort_order.asc`, { headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToField);
  },
  async replaceFields(fields) {
    await fetch(`${SUPABASE_URL}/rest/v1/custom_fields`, { method: "DELETE", headers: { ...this.headers, Prefer: "return=minimal" } });
    if (!fields.length) return [];
    const rows = fields.map((f, i) => fieldToDb({ ...f, sort_order: i }));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/custom_fields`, {
      method: "POST",
      headers: { ...this.headers, Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToField);
  },
};

// ── Converters ────────────────────────────────────────────────────────────────
function itemToDb(item) {
  const { name,description,sku,price,cost,quantity,lowStockThreshold,category,aisle,supplier,expiry,notes,id,createdAt,...rest } = item;
  const custom_data = {};
  Object.keys(rest).forEach(k => { if (!["_t"].includes(k)) custom_data[k] = rest[k]; });
  return { id, name, description: description||"", sku: sku||"", price: price||0, cost: cost||0, quantity: quantity||0, low_stock_threshold: lowStockThreshold||0, category: category||"Tires", aisle: aisle||"", supplier: supplier||"", expiry: expiry||"", notes: notes||"", custom_data, created_at: createdAt||new Date().toISOString().split("T")[0] };
}
function dbToItem(row) {
  return { id:row.id, name:row.name, description:row.description, sku:row.sku, price:row.price, cost:row.cost, quantity:row.quantity, lowStockThreshold:row.low_stock_threshold, category:row.category, aisle:row.aisle, supplier:row.supplier, expiry:row.expiry, notes:row.notes, createdAt:row.created_at, ...(row.custom_data||{}) };
}
function fieldToDb(f) { return { id:f.id, key:f.key, label:f.label, type:f.type, required:f.required||false, sort_order:f.sort_order||0 }; }
function dbToField(row) { return { id:row.id, key:row.key, label:row.label, type:row.type, required:row.required, core:false, sort_order:row.sort_order }; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid   = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); });
const today = () => new Date().toISOString().split("T")[0];
const CATEGORIES = ["Tires", "Other"];
const CORE_FIELDS = [
  { key:"name",              label:"Product Name",     type:"text",     required:true,  core:true },
  { key:"description",       label:"Description",      type:"text",     required:false, core:true },
  { key:"sku",               label:"SKU / Barcode",    type:"text",     required:false, core:true },
  { key:"category",          label:"Category",         type:"select",   required:false, core:true },
  { key:"price",             label:"Sale Price ($)",   type:"number",   required:false, core:true },
  { key:"cost",              label:"Cost ($)",         type:"number",   required:false, core:true },
  { key:"quantity",          label:"Quantity",         type:"number",   required:true,  core:true },
  { key:"lowStockThreshold", label:"Low Stock Alert",  type:"number",   required:false, core:true },
  { key:"aisle",             label:"Aisle / Location", type:"text",     required:false, core:true },
  { key:"supplier",          label:"Supplier / Brand", type:"text",     required:false, core:true },
  { key:"expiry",            label:"Expiry Date",      type:"date",     required:false, core:true },
  { key:"notes",             label:"Notes",            type:"textarea", required:false, core:true },
  { key:"condition",         label:"Condition",        type:"condition", required:false, core:true },
];

// ── Shared styles ─────────────────────────────────────────────────────────────
const Backdrop = ({ onClick }) => (
  <div onClick={onClick} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(3px)",zIndex:50 }} />
);
const iS = { background:"#1a1a1a",border:"1px solid #2d2d2d",borderRadius:8,padding:"10px 12px",color:"#f3f4f6",fontSize:14,outline:"none",fontFamily:"monospace",width:"100%",transition:"border-color .2s" };
const lS = { fontSize:11,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,fontFamily:"monospace",marginBottom:4,display:"block" };

// ── Scanner ───────────────────────────────────────────────────────────────────
function Scanner({ onDetect, onClose }) {
  const videoRef=useRef(null),canvasRef=useRef(null),rafRef=useRef(null),streamRef=useRef(null);
  const [error,setError]=useState(""),[hint,setHint]=useState("Point camera at a QR or barcode");
  const tick=useCallback(()=>{
    const v=videoRef.current,c=canvasRef.current;
    if(!v||!c||v.readyState!==4){rafRef.current=requestAnimationFrame(tick);return;}
    c.width=v.videoWidth;c.height=v.videoHeight;
    const ctx=c.getContext("2d");ctx.drawImage(v,0,0);
    const img=ctx.getImageData(0,0,c.width,c.height);
    if(window.jsQR){const code=window.jsQR(img.data,img.width,img.height,{inversionAttempts:"dontInvert"});if(code){onDetect(code.data);return;}}
    rafRef.current=requestAnimationFrame(tick);
  },[onDetect]);
  useEffect(()=>{
    if(!window.jsQR){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js";s.onload=()=>setHint("Ready — aim at code");document.head.appendChild(s);}
    navigator.mediaDevices?.getUserMedia({video:{facingMode:"environment"}})
      .then(stream=>{streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}rafRef.current=requestAnimationFrame(tick);})
      .catch(()=>setError("Camera access denied."));
    return()=>{cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());};
  },[tick]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:100,background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:420,padding:"0 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#f59e0b",letterSpacing:2}}>SCAN CODE</span>
          <button onClick={onClose} style={{background:"#1f1f1f",border:"1px solid #333",color:"#aaa",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13}}>✕ Close</button>
        </div>
        {error?<div style={{background:"#3b0000",border:"1px solid #ef4444",borderRadius:12,padding:24,color:"#fca5a5",textAlign:"center",fontFamily:"monospace"}}>{error}</div>
        :<>
          <div style={{position:"relative",borderRadius:16,overflow:"hidden",border:"2px solid #f59e0b",boxShadow:"0 0 30px rgba(245,158,11,.3)"}}>
            <video ref={videoRef} style={{width:"100%",display:"block",background:"#000"}} playsInline muted/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{width:200,height:200,position:"relative"}}>
                {["tl","tr","bl","br"].map(c=><div key={c} style={{position:"absolute",width:24,height:24,borderColor:"#f59e0b",borderStyle:"solid",borderWidth:0,...(c==="tl"?{top:0,left:0,borderTopWidth:3,borderLeftWidth:3,borderTopLeftRadius:4}:{}),...(c==="tr"?{top:0,right:0,borderTopWidth:3,borderRightWidth:3,borderTopRightRadius:4}:{}),...(c==="bl"?{bottom:0,left:0,borderBottomWidth:3,borderLeftWidth:3,borderBottomLeftRadius:4}:{}),...(c==="br"?{bottom:0,right:0,borderBottomWidth:3,borderRightWidth:3,borderBottomRightRadius:4}:{})}}/>)}
              </div>
            </div>
          </div>
          <canvas ref={canvasRef} style={{display:"none"}}/>
          <p style={{color:"#6b7280",fontSize:13,textAlign:"center",marginTop:12,fontFamily:"monospace"}}>{hint}</p>
        </>}
      </div>
    </div>
  );
}

// ── Field Component ───────────────────────────────────────────────────────────
function Field({ f, value, onChange }) {
  const handleFocus = e => e.target.style.borderColor = "#f59e0b";
  const handleBlur  = e => e.target.style.borderColor = "#2d2d2d";
  return (
    <div style={{display:"flex",flexDirection:"column"}}>
      <label style={lS}>{f.label}{f.required?" *":""}</label>
      {f.type==="textarea"
        ? <textarea value={value||""} onChange={e=>onChange(f.key,e.target.value)} rows={3} style={{...iS,resize:"vertical"}} onFocus={handleFocus} onBlur={handleBlur}/>
        : f.type==="select"
        ? <select value={value||"Tires"} onChange={e=>onChange(f.key,e.target.value)} style={iS}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
        : f.type==="condition"
        ? <div style={{display:"flex",gap:8}}>
            {["New","Used"].map(opt=>(
              <button key={opt} type="button" onClick={()=>onChange(f.key,opt)}
                style={{flex:1,padding:"10px",borderRadius:8,border:`2px solid ${(value||"New")===opt?(opt==="Used"?"#7c3aed":"#4ade80"):"#2d2d2d"}`,background:(value||"New")===opt?(opt==="Used"?"#2e1065":"#052e16"):"#1a1a1a",color:(value||"New")===opt?(opt==="Used"?"#a78bfa":"#4ade80"):"#6b7280",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>
                {opt==="New"?"✓ NEW":"⚠ USED"}
              </button>
            ))}
          </div>
        : <input type={f.type} value={value||""} onChange={e=>onChange(f.key,e.target.value)} style={iS} onFocus={handleFocus} onBlur={handleBlur}/>}
    </div>
  );
}

// ── Item Form ─────────────────────────────────────────────────────────────────
function ItemForm({ initial, customFields, onSave, onCancel, title, saving }) {
  const blank = () => { const b={name:"",description:"",sku:"",price:"",cost:"",quantity:"",lowStockThreshold:"10",category:"Tires",aisle:"",supplier:"",expiry:"",notes:""}; customFields.forEach(f=>{b[f.key]="";}); return b; };
  const [form,setForm] = useState(initial||blank());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const handleSave = () => { if(!form.name||!form.quantity) return; onSave({...form,price:parseFloat(form.price)||0,cost:parseFloat(form.cost)||0,quantity:parseInt(form.quantity)||0,lowStockThreshold:parseInt(form.lowStockThreshold)||0}); };
  return(<>
    <Backdrop onClick={onCancel}/>
    <div style={{position:"fixed",inset:0,zIndex:60,overflowY:"auto",padding:"16px"}}>
      <div style={{maxWidth:540,margin:"0 auto",background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:24,boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#f59e0b",letterSpacing:2}}>{title}</span>
          <button onClick={onCancel} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"grid",gap:14}}>
          <Field f={CORE_FIELDS[0]}  value={form.name}               onChange={set}/>
          <Field f={CORE_FIELDS[1]}  value={form.description}        onChange={set}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[2]}  value={form.sku}              onChange={set}/>
            <Field f={CORE_FIELDS[3]}  value={form.category}         onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[4]}  value={form.price}            onChange={set}/>
            <Field f={CORE_FIELDS[5]}  value={form.cost}             onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[6]}  value={form.quantity}         onChange={set}/>
            <Field f={CORE_FIELDS[7]}  value={form.lowStockThreshold} onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[8]}  value={form.aisle}            onChange={set}/>
            <Field f={CORE_FIELDS[9]}  value={form.supplier}         onChange={set}/>
          </div>
          <Field f={CORE_FIELDS[10]} value={form.expiry}             onChange={set}/>
          <Field f={CORE_FIELDS[11]} value={form.notes}              onChange={set}/>
          <Field f={CORE_FIELDS[12]} value={form.condition}           onChange={set}/>
          {customFields.length>0&&<div style={{borderTop:"1px solid #2a2a2a",paddingTop:14}}>
            <div style={{fontSize:10,color:"#f59e0b",letterSpacing:2,marginBottom:12}}>CUSTOM FIELDS</div>
            <div style={{display:"grid",gap:14}}>{customFields.map(f=><Field key={f.id} f={f} value={form[f.key]} onChange={set}/>)}</div>
          </div>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onCancel} style={{flex:1,padding:"12px",background:"#1a1a1a",border:"1px solid #2d2d2d",borderRadius:10,color:"#9ca3af",cursor:"pointer",fontSize:14}}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{flex:2,padding:"12px",background:saving?"#92400e":"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:saving?"not-allowed":"pointer",fontSize:14,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>{saving?"SAVING…":"SAVE ITEM"}</button>
        </div>
      </div>
    </div>
  </>);
}

// ── Item Detail ───────────────────────────────────────────────────────────────
function ItemDetail({ item, customFields, onClose, onEdit, onDelete, deleting, onPrint }) {
  const isLow=item.quantity<=item.lowStockThreshold,isOut=item.quantity===0;
  const margin=item.price&&item.cost?(((item.price-item.cost)/item.price)*100).toFixed(1):null;
  const Row=({label,val,accent})=>(val!=null&&val!=="")?(<div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1e1e1e"}}><span style={{color:"#6b7280",fontSize:13,fontFamily:"monospace"}}>{label}</span><span style={{color:accent||"#f3f4f6",fontSize:13,fontFamily:"monospace",textAlign:"right",maxWidth:"60%"}}>{val}</span></div>):null;
  return(<>
    <Backdrop onClick={onClose}/>
    <div style={{position:"fixed",inset:0,zIndex:60,overflowY:"auto",padding:16}}>
      <div style={{maxWidth:480,margin:"0 auto",background:"#111",border:"1px solid #2a2a2a",borderRadius:20,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
        <div style={{background:"#161616",borderBottom:"1px solid #2a2a2a",padding:"20px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,color:"#f59e0b",letterSpacing:2,fontFamily:"monospace",marginBottom:4}}>{item.category?.toUpperCase()} · {item.sku||"NO SKU"}</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:"#f3f4f6",lineHeight:1.1}}>{item.name}</div>
              {item.description&&<div style={{color:"#6b7280",fontSize:13,marginTop:4}}>{item.description}</div>}
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer",paddingTop:4}}>✕</button>
          </div>
          <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontFamily:"monospace",fontWeight:700,background:isOut?"#3b0000":isLow?"#451a03":"#052e16",color:isOut?"#ef4444":isLow?"#f59e0b":"#4ade80",border:`1px solid ${isOut?"#7f1d1d":isLow?"#92400e":"#14532d"}`}}>{isOut?"⛔ OUT OF STOCK":isLow?"⚠ LOW STOCK":"✓ IN STOCK"} — {item.quantity} units</span>
            {item.condition&&<span style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontFamily:"monospace",fontWeight:700,background:item.condition==="Used"?"#2e1065":"#052e16",color:item.condition==="Used"?"#a78bfa":"#4ade80",border:item.condition==="Used"?"1px solid #7c3aed":"1px solid #14532d"}}>{item.condition==="Used"?"⚠ USED TIRE":"✓ NEW TIRE"}</span>}
            {margin&&<span style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontFamily:"monospace",background:"#0f172a",color:"#38bdf8",border:"1px solid #1e3a5f"}}>MARGIN {margin}%</span>}
          </div>
        </div>
        <div style={{padding:"0 24px"}}>
          <Row label="Sale Price" val={item.price?`$${item.price.toFixed(2)}`:null} accent="#4ade80"/>
          <Row label="Cost" val={item.cost?`$${item.cost.toFixed(2)}`:null}/>
          <Row label="Aisle / Location" val={item.aisle}/>
          <Row label="Supplier / Brand" val={item.supplier}/>
          <Row label="Expiry Date" val={item.expiry} accent={item.expiry&&new Date(item.expiry)<new Date()?"#ef4444":undefined}/>
          <Row label="Low Stock Alert" val={`≤ ${item.lowStockThreshold} units`}/>
          <Row label="Added" val={item.createdAt}/>
          {item.notes&&<div style={{padding:"12px 0",borderBottom:"1px solid #1e1e1e"}}><div style={{color:"#6b7280",fontSize:13,fontFamily:"monospace",marginBottom:6}}>Notes</div><div style={{color:"#d1d5db",fontSize:13,lineHeight:1.5}}>{item.notes}</div></div>}
          {customFields.filter(f=>item[f.key]!=null&&item[f.key]!=="").map(f=><Row key={f.id} label={f.label} val={String(item[f.key])}/>)}
        </div>
        <div style={{display:"flex",gap:10,padding:24}}>
          <button onClick={()=>{if(window.confirm("Delete this item?"))onDelete(item.id);}} disabled={deleting} style={{padding:"11px 16px",background:"#1a0000",border:"1px solid #7f1d1d",borderRadius:10,color:"#ef4444",cursor:deleting?"not-allowed":"pointer",fontSize:13}}>{deleting?"…":"🗑 Delete"}</button>
          {item.condition==="Used"&&<button onClick={()=>onPrint(item)} style={{padding:"11px 14px",background:"#2e1065",border:"1px solid #7c3aed",borderRadius:10,color:"#a78bfa",cursor:"pointer",fontSize:13}}>🖨 Label</button>}
          <button onClick={()=>onEdit(item)} style={{flex:1,padding:"11px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>EDIT ITEM</button>
        </div>
      </div>
    </div>
  </>);
}

// ── Field Manager ─────────────────────────────────────────────────────────────
const FIELD_TYPES = ["text","number","date","textarea"];
function FieldManager({ customFields, onSave, onClose, saving }) {
  const [fields,setFields] = useState(customFields);
  const [newLabel,setNewLabel] = useState(""),[newType,setNewType] = useState("text"),[newReq,setNewReq] = useState(false),[err,setErr] = useState("");
  const addField = () => { const label=newLabel.trim(); if(!label){setErr("Label is required");return;} const key=label.toLowerCase().replace(/[^a-z0-9]/g,"_"); if(fields.find(f=>f.key===key)){setErr("Field already exists");return;} setFields(prev=>[...prev,{id:uid(),key,label,type:newType,required:newReq,core:false}]); setNewLabel("");setNewType("text");setNewReq(false);setErr(""); };
  const removeField = (id) => { if(window.confirm("Remove field?")) setFields(prev=>prev.filter(f=>f.id!==id)); };
  return(<>
    <Backdrop onClick={onClose}/>
    <div style={{position:"fixed",inset:0,zIndex:70,overflowY:"auto",padding:16}}>
      <div style={{maxWidth:480,margin:"0 auto",background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:24,boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#f59e0b",letterSpacing:2}}>MANAGE FIELDS</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <p style={{color:"#6b7280",fontSize:12,marginBottom:20}}>Add or remove custom fields.</p>
        <div style={{fontSize:10,color:"#6b7280",letterSpacing:2,marginBottom:8}}>CORE FIELDS (built-in)</div>
        <div style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:12,padding:"4px 0",marginBottom:20}}>
          {CORE_FIELDS.map(f=><div key={f.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px"}}><span style={{color:"#4b5563",fontSize:13,fontFamily:"monospace"}}>{f.label}</span><span style={{fontSize:10,color:"#374151",fontFamily:"monospace",background:"#1a1a1a",padding:"2px 8px",borderRadius:4}}>{f.type}</span></div>)}
        </div>
        <div style={{fontSize:10,color:"#f59e0b",letterSpacing:2,marginBottom:8}}>CUSTOM FIELDS</div>
        {fields.length===0&&<p style={{color:"#374151",fontSize:12,marginBottom:12,fontFamily:"monospace"}}>No custom fields yet.</p>}
        {fields.map(f=>(
          <div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#161616",border:"1px solid #2a2a2a",borderRadius:10,padding:"10px 14px",marginBottom:8}}>
            <div><span style={{color:"#f3f4f6",fontSize:13,fontFamily:"monospace"}}>{f.label}</span><span style={{color:"#6b7280",fontSize:11,fontFamily:"monospace",marginLeft:8}}>({f.type}){f.required?" *":""}</span></div>
            <button onClick={()=>removeField(f.id)} style={{background:"#1a0000",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",padding:"4px 10px",fontSize:12}}>Remove</button>
          </div>
        ))}
        <div style={{background:"#0d0d0d",border:"1px dashed #2d2d2d",borderRadius:12,padding:16,marginTop:8}}>
          <div style={{fontSize:10,color:"#6b7280",letterSpacing:2,marginBottom:12}}>ADD NEW FIELD</div>
          <div style={{display:"grid",gap:10}}>
            <input placeholder='Field name (e.g. "Warranty Miles")' value={newLabel} onChange={e=>{setNewLabel(e.target.value);setErr("");}} style={{...iS,width:"100%"}} onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#2d2d2d"}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:4,fontFamily:"monospace"}}>TYPE</div><select value={newType} onChange={e=>setNewType(e.target.value)} style={{...iS,width:"100%"}}>{FIELD_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end"}}><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",paddingBottom:10}}><input type="checkbox" checked={newReq} onChange={e=>setNewReq(e.target.checked)} style={{accentColor:"#f59e0b",width:16,height:16}}/><span style={{color:"#9ca3af",fontSize:12,fontFamily:"monospace"}}>Required</span></label></div>
            </div>
            {err&&<div style={{color:"#ef4444",fontSize:12,fontFamily:"monospace"}}>{err}</div>}
            <button onClick={addField} style={{padding:"11px",background:"#1a1200",border:"1px solid #f59e0b",borderRadius:10,color:"#f59e0b",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>+ ADD FIELD</button>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:"#1a1a1a",border:"1px solid #2d2d2d",borderRadius:10,color:"#9ca3af",cursor:"pointer",fontSize:14}}>Cancel</button>
          <button onClick={()=>onSave(fields)} disabled={saving} style={{flex:2,padding:"12px",background:saving?"#92400e":"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:saving?"not-allowed":"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>{saving?"SAVING…":"SAVE FIELDS"}</button>
        </div>
      </div>
    </div>
  </>);
}

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, onClick }) {
  const isLow=item.quantity<=item.lowStockThreshold,isOut=item.quantity===0;
  return(
    <div onClick={onClick} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#2d2d2d"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1e1e1e"}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{color:"#f3f4f6",fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</span>
          {isOut&&<span style={{fontSize:9,padding:"2px 6px",background:"#3b0000",color:"#ef4444",borderRadius:4,flexShrink:0}}>OUT</span>}
          {!isOut&&isLow&&<span style={{fontSize:9,padding:"2px 6px",background:"#451a03",color:"#f59e0b",borderRadius:4,flexShrink:0}}>LOW</span>}
          {item.condition==="Used"&&<span style={{fontSize:9,padding:"2px 6px",background:"#2e1065",color:"#a78bfa",borderRadius:4,flexShrink:0}}>USED</span>}
        </div>
        <div style={{fontSize:11,color:"#4b5563"}}>{item.category}{item.sku?` · ${item.sku}`:""}{item.aisle?` · ${item.aisle}`:""}</div>
      </div>
      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:isOut?"#ef4444":isLow?"#f59e0b":"#4ade80"}}>{item.quantity}</div>
        {item.price?<div style={{fontSize:11,color:"#6b7280"}}>${item.price.toFixed(2)}</div>:null}
      </div>
    </div>
  );
}


// ── Print Label ───────────────────────────────────────────────────────────────
function PrintLabel({ item, onClose }) {
  const handlePrint = () => window.print();
  return(<>
    <Backdrop onClick={onClose}/>
    <div style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:24,maxWidth:360,width:"100%",boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#f59e0b",letterSpacing:2}}>TIRE LABEL PREVIEW</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {/* Label preview */}
        <div id="print-label" style={{background:"#fff",borderRadius:12,padding:20,color:"#000",fontFamily:"monospace"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,borderBottom:"2px solid #000",paddingBottom:10}}>
            <div>
              <div style={{fontSize:10,letterSpacing:2,color:"#666",marginBottom:2}}>USED TIRE</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,lineHeight:1,color:"#000"}}>{item.name}</div>
            </div>
            <div style={{background:"#000",color:"#fff",padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:"bold"}}>USADO</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {item["aro__r_"]&&<div><div style={{fontSize:9,color:"#666",letterSpacing:1}}>ARO (RIM)</div><div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",color:"#000"}}>R{item["aro__r_"]}</div></div>}
            {item.quantity!=null&&<div><div style={{fontSize:9,color:"#666",letterSpacing:1}}>QTY</div><div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",color:"#000"}}>{item.quantity}</div></div>}
            {item.price&&<div><div style={{fontSize:9,color:"#666",letterSpacing:1}}>PRICE</div><div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",color:"#000"}}>${item.price}</div></div>}
            {item.supplier&&<div><div style={{fontSize:9,color:"#666",letterSpacing:1}}>BRAND</div><div style={{fontSize:14,fontWeight:"bold",color:"#000",marginTop:4}}>{item.supplier}</div></div>}
          </div>
          {item.sku&&<div style={{borderTop:"1px solid #ccc",paddingTop:8,fontSize:11,color:"#666"}}>SKU: {item.sku}</div>}
          {item.aisle&&<div style={{fontSize:11,color:"#666"}}>LOCATION: {item.aisle}</div>}
          {item.description&&<div style={{fontSize:11,color:"#444",marginTop:4,fontStyle:"italic"}}>{item.description}</div>}
        </div>

        <style>{`@media print{body *{visibility:hidden;}#print-label,#print-label *{visibility:visible;}#print-label{position:fixed;top:20px;left:20px;right:20px;border-radius:0;}}`}</style>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onClose} style={{flex:1,padding:"11px",background:"#1a1a1a",border:"1px solid #2d2d2d",borderRadius:10,color:"#9ca3af",cursor:"pointer",fontSize:14}}>Cancel</button>
          <button onClick={handlePrint} style={{flex:2,padding:"11px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>🖨 PRINT LABEL</button>
        </div>
      </div>
    </div>
  </>);
}


// ── Filter Summary ────────────────────────────────────────────────────────────
function FilterSummary({ items }) {
  if (!items || items.length === 0) return null;
  const totalQ = items.reduce((s, i) => s + (i.quantity || 0), 0);
  return (
    <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 16px",marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,fontFamily:"monospace",marginBottom:2}}>FILTERED RESULTS</div>
        <div style={{fontSize:12,color:"#9ca3af",fontFamily:"monospace"}}>{items.length} product{items.length!==1?"s":""}</div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,fontFamily:"monospace",marginBottom:2}}>TOTAL TIRES</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#f59e0b",letterSpacing:1}}>{totalQ.toLocaleString()}</div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [items,setItems]               = useState([]);
  const [customFields,setCustomFields] = useState([]);
  const [loading,setLoading]           = useState(true);
  const [dbError,setDbError]           = useState("");
  const [view,setView]                 = useState("dashboard");
  const [search,setSearch]             = useState("");
  const [filterCat,setFilterCat]       = useState("All");
  const [filterRim,setFilterRim]       = useState("All");
  const [filterCond,setFilterCond]     = useState("All");
  const [showPrintLabel,setShowPrintLabel] = useState(null);
  const [showScanner,setShowScanner]   = useState(false);
  const [showForm,setShowForm]         = useState(false);
  const [showFieldMgr,setShowFieldMgr] = useState(false);
  const [editItem,setEditItem]         = useState(null);
  const [formInitial,setFormInitial]   = useState(null);
  const [detailItem,setDetailItem]     = useState(null);
  const [saving,setSaving]             = useState(false);
  const [deleting,setDeleting]         = useState(false);
  const [savingFields,setSavingFields] = useState(false);
  const [toast,setToast]               = useState(null);

  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  // ── Load from Supabase ──
  useEffect(()=>{
    (async()=>{
      try {
        const [its,flds] = await Promise.all([sb.getItems(), sb.getFields()]);
        setItems(its); setCustomFields(flds);
      } catch(e) {
        setDbError("Cannot connect to database. Check your internet connection.");
        console.error(e);
      } finally { setLoading(false); }
    })();
  },[]);

  const saveItem = async (data) => {
    setSaving(true);
    try {
      const itemData = { ...data, id: editItem?.id||uid(), createdAt: editItem?.createdAt||today() };
      const saved = await sb.upsertItem(itemData);
      if (editItem) setItems(prev=>prev.map(i=>i.id===saved.id?saved:i));
      else          setItems(prev=>[saved,...prev]);
      showToast(editItem?"Item updated":"Item added");
      setDetailItem(null);
    } catch(e) { showToast("Save failed: "+e.message,"error"); }
    finally { setSaving(false); setShowForm(false); setEditItem(null); setFormInitial(null); }
  };

  const deleteItem = async (id) => {
    setDeleting(true);
    try {
      await sb.deleteItem(id);
      setItems(prev=>prev.filter(i=>i.id!==id));
      setDetailItem(null);
      showToast("Item deleted","error");
    } catch(e) { showToast("Delete failed: "+e.message,"error"); }
    finally { setDeleting(false); }
  };

  const saveFields = async (fields) => {
    setSavingFields(true);
    try {
      const saved = await sb.replaceFields(fields);
      setCustomFields(saved);
      setShowFieldMgr(false);
      showToast("Fields saved");
    } catch(e) { showToast("Failed: "+e.message,"error"); }
    finally { setSavingFields(false); }
  };

  const handleScan = (code) => {
    setShowScanner(false);
    const found = items.find(i=>i.sku===code);
    if (found) { setDetailItem(found); showToast(`Found: ${found.name}`); }
    else {
      const blank = {name:"",description:"",sku:code,price:"",cost:"",quantity:"",lowStockThreshold:"10",category:"Tires",aisle:"",supplier:"",expiry:"",notes:""};
      customFields.forEach(f=>{blank[f.key]="";});
      setFormInitial(blank); setEditItem(null); setShowForm(true); showToast("New item from scan","info");
    }
  };

  const handleExport = () => {
    const json = JSON.stringify({version:2,exportedAt:new Date().toISOString(),customFields,items},null,2);
    const blob = new Blob([json],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`stockroom-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded ✓");
  };

  // ── Stats ──
  const rimSizes     = ["All",...new Set(items.map(i=>i["aro__r_"]).filter(Boolean)).values()].sort((a,b)=>a>b?1:-1);
  const filtered     = items.filter(i=>{ const q=search.toLowerCase(); return(!q||i.name?.toLowerCase().includes(q)||i.sku?.toLowerCase().includes(q)||i.supplier?.toLowerCase().includes(q))&&(filterCat==="All"||i.category===filterCat)&&(filterRim==="All"||i["aro__r_"]===filterRim)&&(filterCond==="All"||i.condition===filterCond); });
  const lowStockItems = items.filter(i=>i.quantity<=i.lowStockThreshold&&i.quantity>0);
  const outOfStock   = items.filter(i=>i.quantity===0);
  const totalValue   = items.reduce((s,i)=>s+(i.price||0)*(i.quantity||0),0);
  const totalUnits   = items.reduce((s,i)=>s+(i.quantity||0),0);

  // ── Loading / Error screens ──
  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0a0a;}`}</style>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#f59e0b",letterSpacing:3}}>STOCKROOM</div>
      <div style={{color:"#4b5563",fontSize:13,fontFamily:"monospace",letterSpacing:1}}>Connecting to database…</div>
      <div style={{width:40,height:40,border:"3px solid #1e1e1e",borderTop:"3px solid #f59e0b",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (dbError) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0a0a;}`}</style>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#ef4444",letterSpacing:2}}>CONNECTION ERROR</div>
      <div style={{background:"#130000",border:"1px solid #7f1d1d",borderRadius:12,padding:20,color:"#fca5a5",fontSize:13,fontFamily:"monospace",textAlign:"center",maxWidth:360}}>{dbError}</div>
      <button onClick={()=>window.location.reload()} style={{padding:"12px 28px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>RETRY</button>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0a0a;color:#f3f4f6;font-family:'DM Mono',monospace;-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#2d2d2d;border-radius:2px;}
        input[type=number]::-webkit-inner-spin-button{opacity:.4;}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .item-card{animation:slideUp .22s ease both;}
      `}</style>

      <div style={{minHeight:"100vh",background:"#0a0a0a",maxWidth:480,margin:"0 auto",paddingBottom:80}}>

        {/* Header */}
        <div style={{padding:"20px 16px 0",position:"sticky",top:0,background:"#0a0a0a",zIndex:10,borderBottom:"1px solid #161616"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:10,color:"#f59e0b",letterSpacing:3,fontFamily:"monospace"}}>RETAIL</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#f3f4f6",letterSpacing:2,lineHeight:1}}>STOCKROOM</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowScanner(true)} style={{background:"#1a1200",border:"1px solid #f59e0b",borderRadius:10,padding:"8px 14px",color:"#f59e0b",cursor:"pointer",fontSize:18}}>📷</button>
              <button onClick={()=>{setEditItem(null);setFormInitial(null);setShowForm(true);}} style={{background:"#f59e0b",border:"none",borderRadius:10,padding:"8px 16px",color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>+ ADD</button>
            </div>
          </div>
          <div style={{display:"flex",marginBottom:-1}}>
            {[["dashboard","Dashboard"],["list",`Items (${items.length})`],["data","Data"]].map(([v,label])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"8px 14px",background:"transparent",border:"none",borderBottom:view===v?"2px solid #f59e0b":"2px solid transparent",color:view===v?"#f59e0b":"#6b7280",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>{label}</button>
            ))}
          </div>
        </div>

        {/* Dashboard */}
        {view==="dashboard"&&(
          <div style={{padding:16,animation:"fadeIn .3s ease"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {[
                { label:"Unique Products", val:items.length,                                                          color:"#38bdf8" },
                { label:"Total Units",     val:totalUnits.toLocaleString(),                                           color:"#a78bfa" },
                { label:"Inventory Value", val:`$${totalValue.toLocaleString("en-US",{minimumFractionDigits:2})}`,    color:"#4ade80" },
                { label:"Low Stock",       val:lowStockItems.length,                                                  color:"#f59e0b", click:()=>setView("list") },
                { label:"Out of Stock",    val:outOfStock.length,                                                     color:"#ef4444", click:()=>setView("list") },
              ].map(c=>(
                <div key={c.label} onClick={c.click} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16,cursor:c.click?"pointer":"default"}}>
                  <div style={{fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{c.label}</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:c.color,letterSpacing:1}}>{c.val}</div>
                </div>
              ))}
            </div>

            {(outOfStock.length>0||lowStockItems.length>0)&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,color:"#6b7280",letterSpacing:2,marginBottom:10}}>⚠ ALERTS</div>
                {[...outOfStock.map(i=>({...i,_t:"out"})),...lowStockItems.map(i=>({...i,_t:"low"}))].map(item=>(
                  <div key={item.id} onClick={()=>setDetailItem(item)} style={{background:item._t==="out"?"#130000":"#130a00",border:`1px solid ${item._t==="out"?"#7f1d1d":"#78350f"}`,borderRadius:12,padding:"12px 16px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{color:"#f3f4f6",fontSize:14}}>{item.name}</div><div style={{color:"#6b7280",fontSize:11,marginTop:2}}>{item.aisle||item.category}</div></div>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:item._t==="out"?"#ef4444":"#f59e0b"}}>{item._t==="out"?"OUT":`${item.quantity} left`}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{fontSize:11,color:"#6b7280",letterSpacing:2,marginBottom:10}}>RECENT ITEMS</div>
            {items.length===0&&<div style={{textAlign:"center",color:"#4b5563",padding:40,fontSize:13,fontFamily:"monospace"}}>No items yet. Tap + ADD to get started.</div>}
            {items.slice(0,5).map(item=><ItemRow key={item.id} item={item} onClick={()=>setDetailItem(item)}/>)}
            {items.length>5&&<button onClick={()=>setView("list")} style={{width:"100%",padding:12,background:"transparent",border:"1px dashed #2d2d2d",borderRadius:12,color:"#6b7280",cursor:"pointer",fontSize:12,marginTop:8}}>View all {items.length} items →</button>}
          </div>
        )}

        {/* List */}
        {view==="list"&&(
          <div style={{padding:16,animation:"fadeIn .3s ease"}}>
            <input placeholder="🔍  Search name, SKU, supplier…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#111",border:"1px solid #2d2d2d",borderRadius:10,padding:"11px 14px",color:"#f3f4f6",fontSize:13,outline:"none",marginBottom:10,fontFamily:"monospace"}}/>
            
            {/* Category filter */}
            <div style={{fontSize:9,color:"#4b5563",letterSpacing:1,fontFamily:"monospace",marginBottom:4}}>CATEGORY</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:10}}>
              {["All",...CATEGORIES].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{whiteSpace:"nowrap",padding:"5px 14px",background:filterCat===c?"#f59e0b":"#161616",border:"1px solid "+(filterCat===c?"#f59e0b":"#2d2d2d"),borderRadius:20,color:filterCat===c?"#000":"#9ca3af",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>{c}</button>)}
            </div>

            {/* Condition filter */}
            <div style={{fontSize:9,color:"#4b5563",letterSpacing:1,fontFamily:"monospace",marginBottom:4}}>CONDITION</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:10}}>
              {["All","New","Used"].map(c=><button key={c} onClick={()=>setFilterCond(c)} style={{whiteSpace:"nowrap",padding:"5px 14px",background:filterCond===c?(c==="Used"?"#7c3aed":"#f59e0b"):"#161616",border:"1px solid "+(filterCond===c?(c==="Used"?"#7c3aed":"#f59e0b"):"#2d2d2d"),borderRadius:20,color:filterCond===c?"#fff":"#9ca3af",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>{c}</button>)}
            </div>

            {/* Rim size filter */}
            {rimSizes.length>1&&<>
              <div style={{fontSize:9,color:"#4b5563",letterSpacing:1,fontFamily:"monospace",marginBottom:4}}>RIM SIZE (ARO)</div>
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:12}}>
                {rimSizes.map(r=><button key={r} onClick={()=>setFilterRim(r)} style={{whiteSpace:"nowrap",padding:"5px 14px",background:filterRim===r?"#38bdf8":"#161616",border:"1px solid "+(filterRim===r?"#38bdf8":"#2d2d2d"),borderRadius:20,color:filterRim===r?"#000":"#9ca3af",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>{r==="All"?"All":"R"+r}</button>)}
              </div>
            </>}

            {filtered.length===0&&<div style={{textAlign:"center",color:"#4b5563",padding:40,fontSize:13}}>No items found</div>}
            {filtered.map((item,i)=><div key={item.id} className="item-card" style={{animationDelay:`${i*.04}s`}}><ItemRow item={item} onClick={()=>setDetailItem(item)}/></div>)}
            <FilterSummary items={filtered}/>
          </div>
        )}

        {/* Data */}
        {view==="data"&&(
          <div style={{padding:16,animation:"fadeIn .3s ease"}}>
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:8}}>DATABASE</div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#9ca3af",fontSize:13}}>Provider</span><span style={{color:"#38bdf8",fontSize:13,fontFamily:"monospace"}}>Supabase</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#9ca3af",fontSize:13}}>Products</span><span style={{color:"#4ade80",fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>{items.length}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#9ca3af",fontSize:13}}>Total Units</span><span style={{color:"#a78bfa",fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>{totalUnits.toLocaleString()}</span></div>
              <div style={{marginTop:10,padding:"8px 10px",background:"#052e16",border:"1px solid #14532d",borderRadius:8}}><span style={{color:"#86efac",fontSize:11,fontFamily:"monospace"}}>✓ Cloud sync — all devices share the same data</span></div>
            </div>

            <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:"#f59e0b",letterSpacing:2,marginBottom:6}}>CUSTOM FIELDS</div>
              <p style={{color:"#6b7280",fontSize:12,marginBottom:10,lineHeight:1.5}}>{customFields.length===0?"No custom fields yet.":customFields.map(f=>f.label).join(", ")}</p>
              {customFields.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{customFields.map(f=><span key={f.id} style={{padding:"3px 10px",background:"#1a1200",border:"1px solid #78350f",borderRadius:12,color:"#f59e0b",fontSize:11,fontFamily:"monospace"}}>{f.label} <span style={{opacity:.6}}>({f.type})</span></span>)}</div>}
              <button onClick={()=>setShowFieldMgr(true)} style={{width:"100%",padding:"11px",background:"#1a1200",border:"1px solid #f59e0b",borderRadius:10,color:"#f59e0b",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>⚙ MANAGE FIELDS</button>
            </div>

            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16}}>
              <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:6}}>EXPORT BACKUP</div>
              <p style={{color:"#6b7280",fontSize:12,marginBottom:12,lineHeight:1.5}}>Download a full JSON backup of your inventory and custom fields.</p>
              <button onClick={handleExport} style={{width:"100%",padding:"12px",background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,color:"#38bdf8",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>⬇ DOWNLOAD JSON BACKUP</button>
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#0d0d0d",borderTop:"1px solid #1e1e1e",display:"flex",padding:"10px 0 20px"}}>
          {[["dashboard","◼","Dashboard"],["list","≡","Inventory"],["data","⚙","Data"]].map(([v,icon,label])=>(
            <button key={v} onClick={()=>setView(v)} style={{flex:1,background:"transparent",border:"none",color:view===v?"#f59e0b":"#4b5563",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:18}}>{icon}</span>
              <span style={{fontSize:9,fontFamily:"monospace",letterSpacing:1}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      {showPrintLabel&&<PrintLabel item={showPrintLabel} onClose={()=>setShowPrintLabel(null)}/> }
      {showScanner&&<Scanner onDetect={handleScan} onClose={()=>setShowScanner(false)}/>}
      {showForm&&<ItemForm title={editItem?"EDIT ITEM":"NEW ITEM"} initial={editItem||formInitial} customFields={customFields} onSave={saveItem} onCancel={()=>{setShowForm(false);setEditItem(null);setFormInitial(null);}} saving={saving}/>}
      {showFieldMgr&&<FieldManager customFields={customFields} onSave={saveFields} onClose={()=>setShowFieldMgr(false)} saving={savingFields}/>}
      {detailItem&&!showForm&&<ItemDetail item={detailItem} customFields={customFields} onClose={()=>setDetailItem(null)} onEdit={item=>{setEditItem(item);setDetailItem(null);setShowForm(true);}} onDelete={deleteItem} deleting={deleting} onPrint={item=>{setDetailItem(null);setShowPrintLabel(item);}}/>}

      {/* Toast */}
      {toast&&<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#1a0000":toast.type==="info"?"#0a1628":"#052e16",border:`1px solid ${toast.type==="error"?"#7f1d1d":toast.type==="info"?"#1e3a5f":"#14532d"}`,color:toast.type==="error"?"#fca5a5":toast.type==="info"?"#7dd3fc":"#86efac",borderRadius:12,padding:"10px 20px",fontSize:13,fontFamily:"monospace",whiteSpace:"nowrap",zIndex:200,animation:"slideUp .2s ease"}}>{toast.msg}</div>}
    </>
  );
}
