import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Languages, Package, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
type Product = { id:number; name:string; sku:string; unit:string; category_name:string|null; min_quantity:number; stock_quantity:number };
type Summary = { products:number; lowStock:number; outOfStock:number; healthyStock:number };
type Language = "rw" | "en";
const copy = {
  rw: {
    eyebrow:"UBUBIKO SMART · AMAKURU Y'UBUBIKO", title:"Murakaza neza kuri UBUBIKO SMART",
    subtitle:"Reba ibicuruzwa bihari n'uko ububiko buhagaze.", overview:"Incamake y'ububiko",
    products:"Ibicuruzwa byose", low:"Stock iri hasi", out:"Byashize", healthy:"Bihari neza",
    catalogue:"Urutonde rw'ibicuruzwa", catalogueSub:"Shakisha igicuruzwa cyangwa uhitemo icyiciro.",
    search:"Shakisha izina cyangwa SKU...", all:"Ibyiciro byose", available:"Kirahari",
    lowLabel:"Kiri hafi gushira", outLabel:"Cyashize", empty:"Nta bicuruzwa bibonetse.",
    loading:"Turimo kuzana amakuru...", refresh:"Kongera kuvugurura", online:"Database iri gukora",
    offline:"Ntibishobotse kugera kuri database", footer:"Amakuru agaragazwa ava muri sisitemu y'ububiko.",
    noCategory:"Nta cyiciro", retry:"Ongera ugerageze"
  },
  en: {
    eyebrow:"UBUBIKO SMART · INVENTORY INFORMATION", title:"Welcome to UBUBIKO SMART",
    subtitle:"Explore available products and check current stock levels.", overview:"Inventory overview",
    products:"Total products", low:"Low stock", out:"Out of stock", healthy:"In stock",
    catalogue:"Product catalogue", catalogueSub:"Search for a product or filter by category.",
    search:"Search name or SKU...", all:"All categories", available:"Available",
    lowLabel:"Low stock", outLabel:"Out of stock", empty:"No products found.",
    loading:"Loading inventory...", refresh:"Refresh data", online:"Database connected",
    offline:"Unable to reach the database", footer:"Information shown is provided by the inventory system.",
    noCategory:"Uncategorised", retry:"Try again"
  }
};
const emptySummary:Summary = {products:0,lowStock:0,outOfStock:0,healthyStock:0};
type ChatMessage = { role:"user"|"assistant"; content:string };
function ParentChat({lang}:{lang:Language}) {
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const welcome=lang==="rw"?"Muraho! Ndi umufasha wa UBUBIKO SMART. Nakugirira akahe kamaro?":"Hello! I'm the UBUBIKO SMART assistant. How can I help?";
  async function send() {
    const text=input.trim();
    if(!text||sending)return;
    const next=[...messages,{role:"user" as const,content:text}];
    setMessages(next);setInput("");setSending(true);
    try {
      const response=await fetch(API+"/public/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,history:messages.slice(-8)})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||"Chat unavailable");
      setMessages([...next,{role:"assistant",content:data.reply}]);
    } catch(error) {
      const message=error instanceof Error?error.message:"Connection error";
      setMessages([...next,{role:"assistant",content:lang==="rw"?"Mbabarira, umufasha ntaraboneka. Ongera ugerageze nyuma.":"Sorry, the assistant is unavailable right now. Please try again later."+(message.includes("not configured")?" (AI key not configured.)":"")}]);
    } finally {setSending(false);}
  }
  return <div className="chat-widget">
    {open&&<section className="chat-panel" aria-label="UBUBIKO SMART AI chat">
      <header className="chat-head"><span><strong>UBUBIKO SMART AI</strong><small>{lang==="rw"?"Umufasha w'ababyeyi":"Parent support assistant"}</small></span><button onClick={()=>setOpen(false)} aria-label="Close chat">×</button></header>
      <div className="chat-messages"><div className="chat-bubble assistant">{welcome}</div>{messages.map((m,i)=><div key={i} className={"chat-bubble "+m.role}>{m.content}</div>)}{sending&&<div className="chat-bubble assistant typing">•••</div>}</div>
      <form className="chat-form" onSubmit={e=>{e.preventDefault();void send();}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder={lang==="rw"?"Andika ubutumwa...":"Type your message..."} maxLength={1000}/><button disabled={sending||!input.trim()}>{sending?"…":"➤"}</button></form>
    </section>}
    <button className="chat-launch" onClick={()=>setOpen(!open)} aria-label="Open AI chat">{open?"×":"✦"}<span>{lang==="rw"?"Ubufasha":"AI Help"}</span></button>
  </div>;
}


export default function App() {
  const [lang,setLang] = useState<Language>("rw");
  const [products,setProducts] = useState<Product[]>([]);
  const [summary,setSummary] = useState<Summary>(emptySummary);
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("all");
  const [loading,setLoading] = useState(true);
  const [online,setOnline] = useState(false);
  const [error,setError] = useState("");
  const t = copy[lang];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse,productsResponse] = await Promise.all([
        fetch(API + "/public/summary"),
        fetch(API + "/public/products")
      ]);
      if (!summaryResponse.ok || !productsResponse.ok) throw new Error("API request failed");
      const [summaryData,productData] = await Promise.all([summaryResponse.json(),productsResponse.json()]);
      setSummary({
        products:Number(summaryData.products)||0,
        lowStock:Number(summaryData.lowStock)||0,
        outOfStock:Number(summaryData.outOfStock)||0,
        healthyStock:Number(summaryData.healthyStock)||0
      });
      setProducts(Array.isArray(productData)?productData:[]);
      setOnline(true);
    } catch {
      setOnline(false);
      setError(lang==="rw"?"Seriveri ntibonetse. Reba ko backend iri gukora.":"The server is unavailable. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  },[lang]);

  useEffect(()=>{ void load(); },[load]);

  const categories = useMemo(()=>Array.from(new Set(products.map(p=>p.category_name || t.noCategory))),[products,t.noCategory]);
  const filtered = useMemo(()=>products.filter(p=>{
    const matchesQuery = (p.name+" "+p.sku).toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category==="all" || (p.category_name || t.noCategory)===category;
    return matchesQuery && matchesCategory;
  }),[products,query,category,t.noCategory]);

  const status = (p:Product) => Number(p.stock_quantity)<=0 ? "out" : Number(p.stock_quantity)<=Number(p.min_quantity) ? "low" : "healthy";

  return <div className="portal">
    <header className="topbar">
      <a className="brand" href="#" aria-label="UBUBIKO SMART home">
        <span className="brand-icon"><Boxes size={25}/></span>
        <span><strong>UBUBIKO <i>SMART</i></strong><small>INVENTORY PORTAL</small></span>
      </a>
      <div className="top-actions">
        <span className={online?"connection online":"connection offline"}>{online?<Wifi size={15}/>:<WifiOff size={15}/>}<span>{online?t.online:t.offline}</span></span>
        <button className="language" onClick={()=>setLang(lang==="rw"?"en":"rw")}><Languages size={17}/>{lang==="rw"?"EN":"RW"}</button>
        <button className="refresh" onClick={()=>void load()} disabled={loading} aria-label={t.refresh}><RefreshCw size={17}/></button>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <a className="hero-link" href="#catalogue">{t.catalogue} <span>↘</span></a>
        </div>
        <div className="hero-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-box"><Boxes size={82} strokeWidth={1.1}/></div><span className="gold-dot dot-one"/><span className="gold-dot dot-two"/></div>
      </section>

      <section className="overview">
        <div className="section-heading"><div><span className="eyebrow">{t.eyebrow}</span><h2>{t.overview}</h2></div><span className="live-tag"><span/> LIVE</span></div>
        <div className="stats">
          <article className="stat-card"><span className="stat-icon"><Package/></span><small>{t.products}</small><strong>{loading?"—":summary.products}</strong></article>
          <article className="stat-card"><span className="stat-icon warning"><AlertTriangle/></span><small>{t.low}</small><strong>{loading?"—":summary.lowStock}</strong></article>
          <article className="stat-card"><span className="stat-icon danger"><AlertTriangle/></span><small>{t.out}</small><strong>{loading?"—":summary.outOfStock}</strong></article>
          <article className="stat-card"><span className="stat-icon success"><CheckCircle2/></span><small>{t.healthy}</small><strong>{loading?"—":summary.healthyStock}</strong></article>
        </div>
      </section>

      <section className="catalogue" id="catalogue">
        <div className="catalogue-heading"><div><span className="eyebrow">UBUBIKO SMART</span><h2>{t.catalogue}</h2><p>{t.catalogueSub}</p></div><span className="result-count">{filtered.length} / {products.length}</span></div>
        <div className="filters">
          <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/></label>
          <select value={category} onChange={e=>setCategory(e.target.value)} aria-label={t.all}><option value="all">{t.all}</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
        </div>
        {error&&<div className="error-state"><WifiOff size={22}/><p>{error}</p><button onClick={()=>void load()}>{t.retry}</button></div>}
        {loading&&!products.length?<div className="loading-state"><span className="spinner"/>{t.loading}</div>:!filtered.length?<div className="empty-state">{t.empty}</div>:<div className="product-grid">
          {filtered.map(p=><article className="product-card" key={p.id}>
            <div className="product-top"><span className="product-icon"><Package size={23}/></span><span className={"stock-pill "+status(p)}>{status(p)==="out"?t.outLabel:status(p)==="low"?t.lowLabel:t.available}</span></div>
            <span className="product-category">{p.category_name||t.noCategory}</span>
            <h3>{p.name}</h3>
            <div className="product-meta"><span>{p.sku}</span><span>{p.unit}</span></div>
            <div className="stock-line"><span>{t.healthy}</span><strong>{Number(p.stock_quantity)||0}</strong></div>
          </article>)}
        </div>}
      </section>
    </main>
    <footer><span className="footer-brand">UBUBIKO <i>SMART</i></span><span>{t.footer}</span></footer>
    <ParentChat lang={lang}/>
  </div>;
}
