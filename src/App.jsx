// v3.0 - signup fix
import { useState, useEffect, useRef, useCallback } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "https://vugqkfdweyhdtvovvnci.supabase.co";
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_KEY  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Z3FrZmR3ZXloZHR2b3Z2bmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjk0MDgsImV4cCI6MjA4ODkwNTQwOH0.FsLAnELsq1G9ZepOR1ncbuCpDcvHU_0OtVk3aYYwsD4";
const STRIPE_PK     = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const PRICE_MONTHLY  = import.meta.env.VITE_PRICE_MONTHLY  || "price_1TAYDJAfBHqpcsRg3QIKBgVI";
const PRICE_ANNUAL   = import.meta.env.VITE_PRICE_ANNUAL   || "price_1TAYE8AfBHqpcsRgoWkO9P5Z";
const PRICE_LIFETIME = import.meta.env.VITE_PRICE_LIFETIME || "price_1TAYEZAfBHqpcsRgV1S4KfmZ";
const ADMIN_EMAIL   = "admin@rambitllc.com"; // ← change to your email

// ── Supabase Auth ─────────────────────────────────────────────────────────────
const auth = {
  async signUp(email, password, businessName) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password, data: { business_name: businessName } }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d;
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d;
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
  },
  async getUser(token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d;
  },
  async resetPassword(email) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d;
  },
  save(session) { localStorage.setItem("sb_session", JSON.stringify(session)); },
  load() { try { return JSON.parse(localStorage.getItem("sb_session")); } catch { return null; } },
  clear() { localStorage.removeItem("sb_session"); },
};

// ── Supabase DB ───────────────────────────────────────────────────────────────
const db = {
  headers(token) {
    return { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  },
  async getTenant(token, userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?owner_id=eq.${userId}&limit=1`, { headers: this.headers(token) });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    return rows[0] || null;
  },
  async createTenant(token, userId, email, businessName) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
      method: "POST",
      headers: { ...this.headers(token), Prefer: "return=representation" },
      body: JSON.stringify({ owner_id: userId, email, business_name: businessName, status: "trial", plan: "trial" }),
    });
    if (!r.ok) throw new Error(await r.text());
    const [row] = await r.json();
    return row;
  },
  async getAllTenants(token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?order=created_at.desc`, { headers: this.headers(token) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async updateTenantStatus(token, tenantId, status) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { ...this.headers(token), Prefer: "return=representation" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async getItems(token, tenantId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items?tenant_id=eq.${tenantId}&order=created_at.desc`, { headers: this.headers(token) });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToItem);
  },
  async upsertItem(token, item, tenantId) {
    const row = { ...itemToDb(item), tenant_id: tenantId };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
      method: "POST",
      headers: { ...this.headers(token), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    const [saved] = await r.json();
    return dbToItem(saved);
  },
  async deleteItem(token, id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/items?id=eq.${id}`, { method: "DELETE", headers: this.headers(token) });
    if (!r.ok) throw new Error(await r.text());
  },
  async getFields(token, tenantId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/custom_fields?tenant_id=eq.${tenantId}&order=sort_order.asc`, { headers: this.headers(token) });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToField);
  },
  async replaceFields(token, tenantId, fields) {
    await fetch(`${SUPABASE_URL}/rest/v1/custom_fields?tenant_id=eq.${tenantId}`, { method: "DELETE", headers: this.headers(token) });
    if (!fields.length) return [];
    const rows = fields.map((f, i) => ({ ...fieldToDb(f), tenant_id: tenantId, sort_order: i }));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/custom_fields`, {
      method: "POST",
      headers: { ...this.headers(token), Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).map(dbToField);
  },
};

// ── Stripe checkout ───────────────────────────────────────────────────────────
async function startCheckout(token, priceId, stripeCustomerId, email, tenantId) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ priceId, customerId: stripeCustomerId, email, tenantId }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}

// ── Converters ────────────────────────────────────────────────────────────────
function itemToDb(item) {
  const { name,description,sku,price,cost,quantity,lowStockThreshold,category,aisle,supplier,expiry,notes,id,createdAt,...rest } = item;
  const custom_data = {};
  Object.keys(rest).forEach(k=>{ if(!["_t"].includes(k)) custom_data[k]=rest[k]; });
  return { id,name,description:description||"",sku:sku||"",price:price||0,cost:cost||0,quantity:quantity||0,low_stock_threshold:lowStockThreshold||0,category:category||"Tires",aisle:aisle||"",supplier:supplier||"",expiry:expiry||"",notes:notes||"",custom_data,created_at:createdAt||new Date().toISOString().split("T")[0] };
}
function dbToItem(row) {
  return { id:row.id,name:row.name,description:row.description,sku:row.sku,price:row.price,cost:row.cost,quantity:row.quantity,lowStockThreshold:row.low_stock_threshold,category:row.category,aisle:row.aisle,supplier:row.supplier,expiry:row.expiry,notes:row.notes,createdAt:row.created_at,...(row.custom_data||{}) };
}
function fieldToDb(f) { return { id:f.id,key:f.key,label:f.label,type:f.type,required:f.required||false,sort_order:f.sort_order||0 }; }
function dbToField(row) { return { id:row.id,key:row.key,label:row.label,type:row.type,required:row.required,core:false,sort_order:row.sort_order }; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid   = () => Math.random().toString(36).slice(2,10);
const today = () => new Date().toISOString().split("T")[0];
const CATEGORIES = ["Tires","Other"];
const CORE_FIELDS = [
  {key:"name",label:"Product Name",type:"text",required:true,core:true},
  {key:"description",label:"Description",type:"text",required:false,core:true},
  {key:"sku",label:"SKU / Barcode",type:"text",required:false,core:true},
  {key:"category",label:"Category",type:"select",required:false,core:true},
  {key:"price",label:"Sale Price ($)",type:"number",required:false,core:true},
  {key:"cost",label:"Cost ($)",type:"number",required:false,core:true},
  {key:"quantity",label:"Quantity",type:"number",required:true,core:true},
  {key:"lowStockThreshold",label:"Low Stock Alert",type:"number",required:false,core:true},
  {key:"aisle",label:"Aisle / Location",type:"text",required:false,core:true},
  {key:"supplier",label:"Supplier / Brand",type:"text",required:false,core:true},
  {key:"expiry",label:"Expiry Date",type:"date",required:false,core:true},
  {key:"notes",label:"Notes",type:"textarea",required:false,core:true},
];

// ── Subscription status helpers ───────────────────────────────────────────────
function getSubStatus(tenant) {
  if (!tenant) return "none";
  if (tenant.status === "active" || tenant.plan === "lifetime") return "active";
  if (tenant.status === "trial") {
    const trialEnd = new Date(tenant.trial_ends_at);
    const daysLeft = Math.ceil((trialEnd - new Date()) / (1000*60*60*24));
    if (daysLeft >= 0) return "trial";
    return "expired";
  }
  if (tenant.status === "past_due") return "past_due";
  if (tenant.status === "cancelled") return "cancelled";
  return "expired";
}
function trialDaysLeft(tenant) {
  if (!tenant?.trial_ends_at) return 0;
  return Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / (1000*60*60*24)));
}
function canWrite(subStatus) { return ["active","trial"].includes(subStatus); }

// ── Shared styles ─────────────────────────────────────────────────────────────
const Backdrop = ({onClick}) => <div onClick={onClick} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(3px)",zIndex:50}}/>;
const iS = {background:"#1a1a1a",border:"1px solid #2d2d2d",borderRadius:8,padding:"10px 12px",color:"#f3f4f6",fontSize:14,outline:"none",fontFamily:"monospace",width:"100%",transition:"border-color .2s"};
const lS = {fontSize:11,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,fontFamily:"monospace",marginBottom:4,display:"block"};

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,setMode]           = useState("login"); // login | signup | reset
  const [email,setEmail]         = useState("");
  const [password,setPassword]   = useState("");
  const [bizName,setBizName]     = useState("");
  const [loading,setLoading]     = useState(false);
  const [error,setError]         = useState("");
  const [success,setSuccess]     = useState("");

  const handle = async () => {
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode==="reset") {
        await auth.resetPassword(email);
        setSuccess("Password reset email sent! Check your inbox.");
      } else if (mode==="signup") {
        const signupData = await auth.signUp(email, password, bizName);
        // if signup returns a session directly, use it; otherwise sign in
        let session = signupData;
        if (!signupData.access_token) {
          await new Promise(r => setTimeout(r, 1500));
          session = await auth.signIn(email, password);
        }
        auth.save(session);
        onAuth(session);
      } else {
        const session = await auth.signIn(email, password);
        auth.save(session);
        onAuth(session);
      }
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{fontSize:10,color:"#f59e0b",letterSpacing:4,fontFamily:"monospace",marginBottom:4}}>RETAIL</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:48,color:"#f3f4f6",letterSpacing:3,lineHeight:1}}>STOCKROOM</div>
        <div style={{color:"#4b5563",fontSize:12,fontFamily:"monospace",marginTop:6}}>Tire Shop Inventory Management</div>
      </div>

      <div style={{width:"100%",maxWidth:400,background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:28}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#f59e0b",letterSpacing:2,marginBottom:20}}>
          {mode==="login"?"SIGN IN":mode==="signup"?"CREATE ACCOUNT":"RESET PASSWORD"}
        </div>

        <div style={{display:"grid",gap:14}}>
          {mode==="signup"&&(
            <div><label style={lS}>Business Name *</label>
            <input value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Joe's Tire Shop" style={iS} onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#2d2d2d"}/></div>
          )}
          <div><label style={lS}>Email *</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={iS} onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#2d2d2d"}/></div>
          {mode!=="reset"&&(
            <div><label style={lS}>Password *</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={iS} onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#2d2d2d"}/></div>
          )}
        </div>

        {error&&<div style={{marginTop:14,padding:"10px 14px",background:"#130000",border:"1px solid #7f1d1d",borderRadius:8,color:"#fca5a5",fontSize:12,fontFamily:"monospace"}}>{error}</div>}
        {success&&<div style={{marginTop:14,padding:"10px 14px",background:"#052e16",border:"1px solid #14532d",borderRadius:8,color:"#86efac",fontSize:12,fontFamily:"monospace"}}>{success}</div>}

        {mode==="signup"&&<div style={{marginTop:14,padding:"10px 14px",background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,color:"#7dd3fc",fontSize:11,fontFamily:"monospace"}}>🎉 14-day free trial — no credit card required</div>}

        <button onClick={handle} disabled={loading} style={{width:"100%",marginTop:20,padding:"13px",background:loading?"#92400e":"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:loading?"not-allowed":"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>
          {loading?"PLEASE WAIT…":mode==="login"?"SIGN IN":mode==="signup"?"START FREE TRIAL":"SEND RESET EMAIL"}
        </button>

        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
          {mode==="login"&&<><button onClick={()=>{setMode("signup");setError("");}} style={{background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Don't have an account? Sign up free</button><button onClick={()=>{setMode("reset");setError("");}} style={{background:"transparent",border:"none",color:"#4b5563",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>Forgot password?</button></>}
          {mode!=="login"&&<button onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}

// ── Pricing Screen ────────────────────────────────────────────────────────────
function PricingScreen({ tenant, token, onClose, expired }) {
  const [loading,setLoading] = useState(null);
  const [error,setError]     = useState("");

  const plans = [
    { id: PRICE_MONTHLY,  name:"Monthly",  price:"$99",  period:"/month", desc:"Billed monthly, cancel anytime", color:"#38bdf8" },
    { id: PRICE_ANNUAL,   name:"Annual",   price:"$999", period:"/year",  desc:"Save 16% vs monthly", color:"#4ade80", badge:"BEST VALUE" },
    { id: PRICE_LIFETIME, name:"Lifetime", price:"$299", period:"once",   desc:"Pay once, use forever", color:"#f59e0b", badge:"ONE TIME" },
  ];

  const checkout = async (priceId) => {
    setLoading(priceId); setError("");
    try {
      const { url } = await startCheckout(token, priceId, tenant?.stripe_customer_id, tenant?.email, tenant?.id);
      window.location.href = url;
    } catch(e) { setError(e.message); setLoading(null); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        {expired
          ? <><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#ef4444",letterSpacing:2}}>TRIAL EXPIRED</div><div style={{color:"#6b7280",fontSize:13,fontFamily:"monospace",marginTop:6}}>Choose a plan to continue using Stockroom</div></>
          : <><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#f59e0b",letterSpacing:2}}>CHOOSE YOUR PLAN</div><div style={{color:"#6b7280",fontSize:13,fontFamily:"monospace",marginTop:6}}>Unlock full access to Stockroom</div></>}
      </div>

      <div style={{width:"100%",maxWidth:480,display:"grid",gap:12}}>
        {plans.map(p=>(
          <div key={p.id} style={{background:"#111",border:`1px solid ${loading===p.id?"#f59e0b":"#2a2a2a"}`,borderRadius:16,padding:20,position:"relative"}}>
            {p.badge&&<span style={{position:"absolute",top:-10,right:16,padding:"3px 10px",background:"#f59e0b",borderRadius:20,fontSize:10,color:"#000",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>{p.badge}</span>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#f3f4f6",letterSpacing:1}}>{p.name}</div>
                <div style={{color:"#6b7280",fontSize:11,fontFamily:"monospace",marginTop:2}}>{p.desc}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:p.color}}>{p.price}</span>
                <span style={{color:"#6b7280",fontSize:11,fontFamily:"monospace",marginLeft:4}}>{p.period}</span>
              </div>
            </div>
            <button onClick={()=>checkout(p.id)} disabled={!!loading} style={{width:"100%",marginTop:14,padding:"11px",background:loading===p.id?"#92400e":"#1a1a1a",border:`1px solid ${p.color}`,borderRadius:10,color:p.color,cursor:loading?"not-allowed":"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>
              {loading===p.id?"REDIRECTING TO PAYMENT…":`GET ${p.name.toUpperCase()} PLAN`}
            </button>
          </div>
        ))}
      </div>

      {error&&<div style={{marginTop:16,padding:"10px 14px",background:"#130000",border:"1px solid #7f1d1d",borderRadius:8,color:"#fca5a5",fontSize:12,fontFamily:"monospace",maxWidth:480,width:"100%"}}>{error}</div>}
      {!expired&&onClose&&<button onClick={onClose} style={{marginTop:20,background:"transparent",border:"none",color:"#4b5563",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>← Back to inventory</button>}
    </div>
  );
}

// ── Payment Reminder Popup ────────────────────────────────────────────────────
function PaymentReminder({ tenant, subStatus, onUpgrade, onDismiss }) {
  const daysLeft = trialDaysLeft(tenant);
  const isPastDue = subStatus === "past_due";

  if (subStatus === "active") return null;

  const msg = isPastDue
    ? { title:"PAYMENT FAILED", body:"Your last payment didn't go through. Update your payment method to keep access.", color:"#ef4444", border:"#7f1d1d", bg:"#130000" }
    : daysLeft <= 3
    ? { title:`${daysLeft} DAYS LEFT IN TRIAL`, body:"Your free trial is ending soon. Upgrade now to keep your inventory data.", color:"#f59e0b", border:"#78350f", bg:"#130a00" }
    : null;

  if (!msg) return null;

  return (
    <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 32px)",maxWidth:448,background:msg.bg,border:`1px solid ${msg.border}`,borderRadius:14,padding:16,zIndex:40,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:msg.color,letterSpacing:1,marginBottom:4}}>{msg.title}</div>
          <div style={{color:"#9ca3af",fontSize:12,fontFamily:"monospace",lineHeight:1.4}}>{msg.body}</div>
        </div>
        <button onClick={onDismiss} style={{background:"transparent",border:"none",color:"#4b5563",cursor:"pointer",fontSize:16,marginLeft:8,flexShrink:0}}>✕</button>
      </div>
      <button onClick={onUpgrade} style={{width:"100%",marginTop:12,padding:"10px",background:msg.color,border:"none",borderRadius:8,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:1}}>UPGRADE NOW</button>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ token, onClose }) {
  const [tenants,setTenants]   = useState([]);
  const [loading,setLoading]   = useState(true);
  const [search,setSearch]     = useState("");

  useEffect(()=>{
    db.getAllTenants(token).then(setTenants).catch(console.error).finally(()=>setLoading(false));
  },[token]);

  const statusColor = s => s==="active"?"#4ade80":s==="trial"?"#38bdf8":s==="past_due"?"#f59e0b":"#ef4444";

  const filtered = tenants.filter(t =>
    t.business_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    active: tenants.filter(t=>t.status==="active").length,
    trial: tenants.filter(t=>t.status==="trial").length,
    pastDue: tenants.filter(t=>t.status==="past_due").length,
  };

  return (
    <>
      <Backdrop onClick={onClose}/>
      <div style={{position:"fixed",inset:0,zIndex:60,overflowY:"auto",padding:16}}>
        <div style={{maxWidth:600,margin:"0 auto",background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:24,boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#f59e0b",letterSpacing:2}}>ADMIN DASHBOARD</span>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>✕</button>
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
            {[
              {label:"Total",val:stats.total,color:"#f3f4f6"},
              {label:"Active",val:stats.active,color:"#4ade80"},
              {label:"Trial",val:stats.trial,color:"#38bdf8"},
              {label:"Past Due",val:stats.pastDue,color:"#f59e0b"},
            ].map(s=>(
              <div key={s.label} style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:12,padding:12,textAlign:"center"}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:s.color}}>{s.val}</div>
                <div style={{fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>{s.label}</div>
              </div>
            ))}
          </div>

          <input placeholder="🔍 Search customers…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:"#0d0d0d",border:"1px solid #2d2d2d",borderRadius:10,padding:"10px 14px",color:"#f3f4f6",fontSize:13,outline:"none",marginBottom:12,fontFamily:"monospace"}}/>

          {loading
            ? <div style={{textAlign:"center",color:"#4b5563",padding:40,fontFamily:"monospace"}}>Loading customers…</div>
            : filtered.length===0
            ? <div style={{textAlign:"center",color:"#4b5563",padding:40,fontFamily:"monospace"}}>No customers found</div>
            : filtered.map(t=>(
              <div key={t.id} style={{background:"#161616",border:"1px solid #2a2a2a",borderRadius:12,padding:"12px 16px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{color:"#f3f4f6",fontSize:14,fontFamily:"monospace",fontWeight:500}}>{t.business_name||"Unnamed"}</div>
                    <div style={{color:"#6b7280",fontSize:11,fontFamily:"monospace",marginTop:2}}>{t.email}</div>
                    <div style={{color:"#4b5563",fontSize:10,fontFamily:"monospace",marginTop:2}}>
                      Plan: {t.plan||"trial"} · Joined: {t.created_at?.split("T")[0]}
                      {t.status==="trial"&&` · ${trialDaysLeft(t)} days left`}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontFamily:"monospace",background:"#0d0d0d",color:statusColor(t.status),border:`1px solid ${statusColor(t.status)}33`}}>{t.status?.toUpperCase()}</span>
                    {t.status!=="active"&&<button onClick={async()=>{await db.updateTenantStatus(token,t.id,"active");setTenants(prev=>prev.map(x=>x.id===t.id?{...x,status:"active"}:x));}} style={{padding:"3px 10px",background:"#052e16",border:"1px solid #14532d",borderRadius:6,color:"#4ade80",cursor:"pointer",fontSize:10,fontFamily:"monospace"}}>Activate</button>}
                    {t.status==="active"&&<button onClick={async()=>{await db.updateTenantStatus(token,t.id,"cancelled");setTenants(prev=>prev.map(x=>x.id===t.id?{...x,status:"cancelled"}:x));}} style={{padding:"3px 10px",background:"#1a0000",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:10,fontFamily:"monospace"}}>Suspend</button>}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}

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
  const handleFocus=e=>e.target.style.borderColor="#f59e0b";
  const handleBlur=e=>e.target.style.borderColor="#2d2d2d";
  return(
    <div style={{display:"flex",flexDirection:"column"}}>
      <label style={lS}>{f.label}{f.required?" *":""}</label>
      {f.type==="textarea"?<textarea value={value||""} onChange={e=>onChange(f.key,e.target.value)} rows={3} style={{...iS,resize:"vertical"}} onFocus={handleFocus} onBlur={handleBlur}/>
      :f.type==="select"?<select value={value||"Tires"} onChange={e=>onChange(f.key,e.target.value)} style={iS}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
      :<input type={f.type} value={value||""} onChange={e=>onChange(f.key,e.target.value)} style={iS} onFocus={handleFocus} onBlur={handleBlur}/>}
    </div>
  );
}

// ── Item Form ─────────────────────────────────────────────────────────────────
function ItemForm({ initial, customFields, onSave, onCancel, title, saving }) {
  const blank=()=>{ const b={name:"",description:"",sku:"",price:"",cost:"",quantity:"",lowStockThreshold:"10",category:"Tires",aisle:"",supplier:"",expiry:"",notes:""}; customFields.forEach(f=>{b[f.key]="";}); return b; };
  const [form,setForm]=useState(initial||blank());
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleSave=()=>{ if(!form.name||!form.quantity) return; onSave({...form,price:parseFloat(form.price)||0,cost:parseFloat(form.cost)||0,quantity:parseInt(form.quantity)||0,lowStockThreshold:parseInt(form.lowStockThreshold)||0}); };
  return(<>
    <Backdrop onClick={onCancel}/>
    <div style={{position:"fixed",inset:0,zIndex:60,overflowY:"auto",padding:"16px"}}>
      <div style={{maxWidth:540,margin:"0 auto",background:"#111",border:"1px solid #2a2a2a",borderRadius:20,padding:24,boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#f59e0b",letterSpacing:2}}>{title}</span>
          <button onClick={onCancel} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"grid",gap:14}}>
          <Field f={CORE_FIELDS[0]}  value={form.name}              onChange={set}/>
          <Field f={CORE_FIELDS[1]}  value={form.description}       onChange={set}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[2]}  value={form.sku}             onChange={set}/>
            <Field f={CORE_FIELDS[3]}  value={form.category}        onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[4]}  value={form.price}           onChange={set}/>
            <Field f={CORE_FIELDS[5]}  value={form.cost}            onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[6]}  value={form.quantity}        onChange={set}/>
            <Field f={CORE_FIELDS[7]}  value={form.lowStockThreshold} onChange={set}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Field f={CORE_FIELDS[8]}  value={form.aisle}           onChange={set}/>
            <Field f={CORE_FIELDS[9]}  value={form.supplier}        onChange={set}/>
          </div>
          <Field f={CORE_FIELDS[10]} value={form.expiry}            onChange={set}/>
          <Field f={CORE_FIELDS[11]} value={form.notes}             onChange={set}/>
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
function ItemDetail({ item, customFields, onClose, onEdit, onDelete, deleting }) {
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
          <button onClick={()=>onEdit(item)} style={{flex:1,padding:"11px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>EDIT ITEM</button>
        </div>
      </div>
    </div>
  </>);
}

// ── Field Manager ─────────────────────────────────────────────────────────────
const FIELD_TYPES=["text","number","date","textarea"];
function FieldManager({ customFields, onSave, onClose, saving }) {
  const [fields,setFields]=useState(customFields);
  const [newLabel,setNewLabel]=useState(""),[newType,setNewType]=useState("text"),[newReq,setNewReq]=useState(false),[err,setErr]=useState("");
  const addField=()=>{ const label=newLabel.trim(); if(!label){setErr("Label is required");return;} const key=label.toLowerCase().replace(/[^a-z0-9]/g,"_"); if(fields.find(f=>f.key===key)){setErr("Field already exists");return;} setFields(prev=>[...prev,{id:uid(),key,label,type:newType,required:newReq,core:false}]); setNewLabel("");setNewType("text");setNewReq(false);setErr(""); };
  const removeField=(id)=>{if(window.confirm("Remove field?"))setFields(prev=>prev.filter(f=>f.id!==id));};
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

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [session,setSession]           = useState(()=>auth.load());
  const [user,setUser]                 = useState(null);
  const [tenant,setTenant]             = useState(null);
  const [items,setItems]               = useState([]);
  const [customFields,setCustomFields] = useState([]);
  const [loading,setLoading]           = useState(true);
  const [dbError,setDbError]           = useState("");
  const [view,setView]                 = useState("dashboard");
  const [search,setSearch]             = useState("");
  const [filterCat,setFilterCat]       = useState("All");
  const [showScanner,setShowScanner]   = useState(false);
  const [showForm,setShowForm]         = useState(false);
  const [showFieldMgr,setShowFieldMgr] = useState(false);
  const [showAdmin,setShowAdmin]       = useState(false);
  const [showPricing,setShowPricing]   = useState(false);
  const [showReminder,setShowReminder] = useState(true);
  const [editItem,setEditItem]         = useState(null);
  const [formInitial,setFormInitial]   = useState(null);
  const [detailItem,setDetailItem]     = useState(null);
  const [saving,setSaving]             = useState(false);
  const [deleting,setDeleting]         = useState(false);
  const [savingFields,setSavingFields] = useState(false);
  const [toast,setToast]               = useState(null);

  const token = session?.access_token;
  const subStatus = getSubStatus(tenant);
  const isAdmin = user?.email === ADMIN_EMAIL;
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  // ── Boot: load user + tenant + data ──
  useEffect(()=>{
    if(!token){setLoading(false);return;}
    (async()=>{
      try {
        const u = await auth.getUser(token);
        setUser(u);
        let t = await db.getTenant(token, u.id);
        if(!t) t = await db.createTenant(token, u.id, u.email, u.user_metadata?.business_name||"My Business");
        setTenant(t);
        const status = getSubStatus(t);
        if(["active","trial"].includes(status)) {
          const [its,flds] = await Promise.all([db.getItems(token,t.id), db.getFields(token,t.id)]);
          setItems(its); setCustomFields(flds);
        }
      } catch(e) {
        if(e.message.includes("JWT")||e.message.includes("token")) { auth.clear(); setSession(null); }
        else setDbError("Connection error. Please refresh.");
        console.error(e);
      } finally { setLoading(false); }
    })();
  },[token]);

  const handleAuth = (sess) => { setSession(sess); setLoading(true); };
  const handleSignOut = async () => { await auth.signOut(token); auth.clear(); setSession(null); setUser(null); setTenant(null); setItems([]); setCustomFields([]); };

  const saveItem=async(data)=>{
    if(!canWrite(subStatus)){showToast("Upgrade your plan to add items","error");return;}
    setSaving(true);
    try {
      const itemData={...data,id:editItem?.id||uid(),createdAt:editItem?.createdAt||today()};
      const saved=await db.upsertItem(token,itemData,tenant.id);
      if(editItem) setItems(prev=>prev.map(i=>i.id===saved.id?saved:i));
      else setItems(prev=>[saved,...prev]);
      showToast(editItem?"Item updated":"Item added");
      setDetailItem(null);
    } catch(e){showToast("Save failed: "+e.message,"error");}
    finally{setSaving(false);setShowForm(false);setEditItem(null);setFormInitial(null);}
  };

  const deleteItem=async(id)=>{
    if(!canWrite(subStatus)){showToast("Upgrade your plan to delete items","error");return;}
    setDeleting(true);
    try { await db.deleteItem(token,id); setItems(prev=>prev.filter(i=>i.id!==id)); setDetailItem(null); showToast("Item deleted","error"); }
    catch(e){showToast("Delete failed: "+e.message,"error");}
    finally{setDeleting(false);}
  };

  const saveFields=async(fields)=>{
    setSavingFields(true);
    try { const saved=await db.replaceFields(token,tenant.id,fields); setCustomFields(saved); setShowFieldMgr(false); showToast("Fields saved"); }
    catch(e){showToast("Failed: "+e.message,"error");}
    finally{setSavingFields(false);}
  };

  const handleScan=(code)=>{
    setShowScanner(false);
    const found=items.find(i=>i.sku===code);
    if(found){setDetailItem(found);showToast(`Found: ${found.name}`);}
    else{ const blank={name:"",description:"",sku:code,price:"",cost:"",quantity:"",lowStockThreshold:"10",category:"Tires",aisle:"",supplier:"",expiry:"",notes:""}; customFields.forEach(f=>{blank[f.key]="";}); setFormInitial(blank);setEditItem(null);setShowForm(true);showToast("New item from scan","info"); }
  };

  const handleExport=()=>{
    const json=JSON.stringify({version:2,exportedAt:new Date().toISOString(),customFields,items},null,2);
    const blob=new Blob([json],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`stockroom-${today()}.json`;a.click();URL.revokeObjectURL(url);
    showToast("Backup downloaded ✓");
  };

  // ── screens ──
  if(!session) return <AuthScreen onAuth={handleAuth}/>;

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0a0a;}`}</style>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#f59e0b",letterSpacing:3}}>STOCKROOM</div>
      <div style={{color:"#4b5563",fontSize:13,fontFamily:"monospace"}}>Loading your inventory…</div>
      <div style={{width:40,height:40,border:"3px solid #1e1e1e",borderTop:"3px solid #f59e0b",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(dbError) return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0a0a;}`}</style>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#ef4444",letterSpacing:2}}>CONNECTION ERROR</div>
      <div style={{background:"#130000",border:"1px solid #7f1d1d",borderRadius:12,padding:20,color:"#fca5a5",fontSize:13,fontFamily:"monospace",textAlign:"center",maxWidth:360}}>{dbError}</div>
      <button onClick={()=>window.location.reload()} style={{padding:"12px 28px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>RETRY</button>
    </div>
  );

  // expired trial or cancelled → force pricing screen
  if(["expired","cancelled"].includes(subStatus)) return <PricingScreen tenant={tenant} token={token} expired={true}/>;

  // show pricing page
  if(showPricing) return <PricingScreen tenant={tenant} token={token} onClose={()=>setShowPricing(false)}/>;

  const filtered=items.filter(i=>{ const q=search.toLowerCase(); return(!q||i.name?.toLowerCase().includes(q)||i.sku?.toLowerCase().includes(q)||i.supplier?.toLowerCase().includes(q))&&(filterCat==="All"||i.category===filterCat); });
  const lowStockItems=items.filter(i=>i.quantity<=i.lowStockThreshold&&i.quantity>0);
  const outOfStock=items.filter(i=>i.quantity===0);
  const totalValue=items.reduce((s,i)=>s+(i.price||0)*(i.quantity||0),0);

  return(
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:"#f59e0b",letterSpacing:3,fontFamily:"monospace"}}>RETAIL</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#f3f4f6",letterSpacing:2,lineHeight:1}}>STOCKROOM</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {/* trial badge */}
              {subStatus==="trial"&&<span onClick={()=>setShowPricing(true)} style={{padding:"4px 10px",background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:20,color:"#38bdf8",fontSize:10,fontFamily:"monospace",cursor:"pointer"}}>{trialDaysLeft(tenant)}d trial</span>}
              {isAdmin&&<button onClick={()=>setShowAdmin(true)} style={{background:"#1a1200",border:"1px solid #f59e0b",borderRadius:8,padding:"6px 10px",color:"#f59e0b",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>ADMIN</button>}
              <button onClick={()=>setShowScanner(true)} style={{background:"#1a1200",border:"1px solid #f59e0b",borderRadius:10,padding:"7px 12px",color:"#f59e0b",cursor:"pointer",fontSize:16}}>📷</button>
              {canWrite(subStatus)&&<button onClick={()=>{setEditItem(null);setFormInitial(null);setShowForm(true);}} style={{background:"#f59e0b",border:"none",borderRadius:10,padding:"7px 14px",color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>+ ADD</button>}
            </div>
          </div>
          {/* business name + sign out */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:11,color:"#4b5563",fontFamily:"monospace"}}>{tenant?.business_name||user?.email}</span>
            <button onClick={handleSignOut} style={{background:"transparent",border:"none",color:"#4b5563",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>Sign out</button>
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
              {[{label:"Total Items",val:items.length,color:"#38bdf8"},{label:"Inventory Value",val:`$${totalValue.toLocaleString("en-US",{minimumFractionDigits:2})}`,color:"#4ade80"},{label:"Low Stock",val:lowStockItems.length,color:"#f59e0b",click:()=>setView("list")},{label:"Out of Stock",val:outOfStock.length,color:"#ef4444",click:()=>setView("list")}].map(c=>(
                <div key={c.label} onClick={c.click} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16,cursor:c.click?"pointer":"default"}}>
                  <div style={{fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{c.label}</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:c.color}}>{c.val}</div>
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
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:12}}>
              {["All",...CATEGORIES].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{whiteSpace:"nowrap",padding:"5px 14px",background:filterCat===c?"#f59e0b":"#161616",border:"1px solid "+(filterCat===c?"#f59e0b":"#2d2d2d"),borderRadius:20,color:filterCat===c?"#000":"#9ca3af",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>{c}</button>)}
            </div>
            {filtered.length===0&&<div style={{textAlign:"center",color:"#4b5563",padding:40,fontSize:13}}>No items found</div>}
            {filtered.map((item,i)=><div key={item.id} className="item-card" style={{animationDelay:`${i*.04}s`}}><ItemRow item={item} onClick={()=>setDetailItem(item)}/></div>)}
          </div>
        )}

        {/* Data */}
        {view==="data"&&(
          <div style={{padding:16,animation:"fadeIn .3s ease"}}>
            {/* Subscription status */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:8}}>SUBSCRIPTION</div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#9ca3af",fontSize:13}}>Plan</span><span style={{color:"#f59e0b",fontSize:13,fontFamily:"monospace",textTransform:"uppercase"}}>{tenant?.plan||"trial"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><span style={{color:"#9ca3af",fontSize:13}}>Status</span>
                <span style={{fontSize:13,fontFamily:"monospace",color:subStatus==="active"?"#4ade80":subStatus==="trial"?"#38bdf8":"#ef4444",textTransform:"uppercase"}}>{subStatus==="trial"?`Trial (${trialDaysLeft(tenant)} days left)`:subStatus}</span>
              </div>
              {subStatus!=="active"&&<button onClick={()=>setShowPricing(true)} style={{width:"100%",padding:"11px",background:"#f59e0b",border:"none",borderRadius:10,color:"#000",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>⚡ UPGRADE NOW</button>}
            </div>

            {/* Custom fields */}
            <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:"#f59e0b",letterSpacing:2,marginBottom:6}}>CUSTOM FIELDS</div>
              <p style={{color:"#6b7280",fontSize:12,marginBottom:10,lineHeight:1.5}}>{customFields.length===0?"No custom fields yet.":customFields.map(f=>f.label).join(", ")}</p>
              {customFields.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{customFields.map(f=><span key={f.id} style={{padding:"3px 10px",background:"#1a1200",border:"1px solid #78350f",borderRadius:12,color:"#f59e0b",fontSize:11,fontFamily:"monospace"}}>{f.label} <span style={{opacity:.6}}>({f.type})</span></span>)}</div>}
              <button onClick={()=>setShowFieldMgr(true)} style={{width:"100%",padding:"11px",background:"#1a1200",border:"1px solid #f59e0b",borderRadius:10,color:"#f59e0b",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>⚙ MANAGE FIELDS</button>
            </div>

            {/* DB info */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:8}}>DATABASE</div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#9ca3af",fontSize:13}}>Provider</span><span style={{color:"#38bdf8",fontSize:13,fontFamily:"monospace"}}>Supabase</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#9ca3af",fontSize:13}}>Items stored</span><span style={{color:"#4ade80",fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>{items.length}</span></div>
              <div style={{marginTop:10,padding:"8px 10px",background:"#052e16",border:"1px solid #14532d",borderRadius:8}}><span style={{color:"#86efac",fontSize:11,fontFamily:"monospace"}}>✓ Cloud sync — all devices share the same data</span></div>
            </div>

            {/* Export */}
            <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:16}}>
              <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,marginBottom:6}}>EXPORT BACKUP</div>
              <p style={{color:"#6b7280",fontSize:12,marginBottom:12,lineHeight:1.5}}>Download a full JSON backup of your inventory.</p>
              <button onClick={handleExport} style={{width:"100%",padding:"12px",background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,color:"#38bdf8",cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>⬇ DOWNLOAD BACKUP</button>
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

      {/* Payment reminder popup */}
      {showReminder&&<PaymentReminder tenant={tenant} subStatus={subStatus} onUpgrade={()=>setShowPricing(true)} onDismiss={()=>setShowReminder(false)}/>}

      {/* Overlays */}
      {showScanner&&<Scanner onDetect={handleScan} onClose={()=>setShowScanner(false)}/>}
      {showForm&&canWrite(subStatus)&&<ItemForm title={editItem?"EDIT ITEM":"NEW ITEM"} initial={editItem||formInitial} customFields={customFields} onSave={saveItem} onCancel={()=>{setShowForm(false);setEditItem(null);setFormInitial(null);}} saving={saving}/>}
      {showFieldMgr&&<FieldManager customFields={customFields} onSave={saveFields} onClose={()=>setShowFieldMgr(false)} saving={savingFields}/>}
      {showAdmin&&isAdmin&&<AdminDashboard token={token} onClose={()=>setShowAdmin(false)}/>}
      {detailItem&&!showForm&&<ItemDetail item={detailItem} customFields={customFields} onClose={()=>setDetailItem(null)} onEdit={item=>{setEditItem(item);setDetailItem(null);setShowForm(true);}} onDelete={deleteItem} deleting={deleting}/>}

      {/* Toast */}
      {toast&&<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#1a0000":toast.type==="info"?"#0a1628":"#052e16",border:`1px solid ${toast.type==="error"?"#7f1d1d":toast.type==="info"?"#1e3a5f":"#14532d"}`,color:toast.type==="error"?"#fca5a5":toast.type==="info"?"#7dd3fc":"#86efac",borderRadius:12,padding:"10px 20px",fontSize:13,fontFamily:"monospace",whiteSpace:"nowrap",zIndex:200,animation:"slideUp .2s ease"}}>{toast.msg}</div>}
    </>
  );
}
