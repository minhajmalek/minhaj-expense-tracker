import { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

// ─── Design Tokens ────────────────────────────────────────────────
const C = {
  green: "#00D09C", greenDk: "#00B386", greenLt: "#E6FAF5",
  red: "#FF6B6B", redLt: "#FFF0F0",
  blue: "#4A90E2", blueLt: "#EBF3FD",
  yellow: "#FFB800", yellowLt: "#FFF8E6",
  purple: "#7B61FF", purpleLt: "#F0EEFF",
  bg: "#F5F7FA", card: "#FFF",
  dark: "#0F1923", dark2: "#1A2535",
  text: "#0F1923", sub: "#4A5568", muted: "#8898AA", border: "#EEF0F3",
};
const PC_COLORS = { Cash: C.green, UPI: C.blue, Card: C.purple, "Net Banking": C.yellow };
const PC_ICONS  = { Cash: "💵", UPI: "📲", Card: "💳", "Net Banking": "🏦" };
const ST_ICONS  = { "Bank Account": "🏦", "Credit Card": "💳", Wallet: "👜" };
const UPI_APPS  = ["Google Pay", "CRED", "BHIM", "Other"];
const CASHBACK_SOURCES = ["UPI Offer", "Amazon Offer", "Bank Offer", "Gift Card", "Discount", "Other"];
const PIE_PAL   = ["#00D09C","#4A90E2","#7B61FF","#FF6B6B","#FFB800","#FF8C42","#4ECDC4","#F72585","#06B6D4","#84CC16"];

const EXP_CATS = ["Home Rent","Bike Fuel","Food","Mobile Recharge","Electricity Bill","Apparel","Transportation","Repairs","Personal Grooming","Health / Medical","Investment","Gift","Society Maintenance","Fashion Accessories","Tech Accessories","Dine Out","Entertainment","Wellness Nutrition"];
const INC_CATS = ["Salary","Freelance","Business","Investment","Gift","Rental","Other"];

const MONTHS_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_F = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const fmt   = n => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;
const full  = n => `₹${Number(n||0).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().split("T")[0];

const CAT_ICONS = {
  // Expense categories
  "Home Rent":"🏠",
  "Bike Fuel":"⛽",
  "Food":"🍱",
  "Mobile Recharge":"📱",
  "Electricity Bill":"⚡",
  "Apparel":"👕",
  "Transportation":"🚗",
  "Repairs":"🔧",
  "Personal Grooming":"💈",
  "Health / Medical":"💊",
  "Investment":"📈",
  "Gift":"🎁",
  "Society Maintenance":"🏘️",
  "Fashion Accessories":"👜",
  "Tech Accessories":"🎧",
  "Dine Out":"🍽️",
  "Entertainment":"🎬",
  "Wellness Nutrition":"🥗",
  // Income categories
  "Salary":"💼","Freelance":"💻","Business":"🏢","Rental":"🏠",
  // Misc
  "Gift Card":"🎁","Wallet Top-up":"💳",
};

const DEFAULT_ACCOUNTS = {
  bankAccounts: ["SBI Savings", "HDFC Savings", "ICICI Savings", "Axis Bank"],
  creditCards:  ["HDFC Millennia", "ICICI Amazon Pay", "SBI SimplyCLICK", "Axis Flipkart"],
  wallets:      ["Paytm Wallet", "PhonePe Wallet", "Amazon Pay"],
  cardRates:    { "HDFC Millennia": 0.25, "ICICI Amazon Pay": 0.20, "SBI SimplyCLICK": 0.25, "Axis Flipkart": 0.20 },
};

// ─── Helpers ──────────────────────────────────────────────────────
const isoToLabel = (d) => new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"});
const emptyForm  = () => ({
  type:"expense", amount:"", category:"Food", date:today(),
  paymentChannel:"UPI", sourceType:"Bank Account", accountName:"",
  upiApp:"", upiAppCustom:"", notes:"",
  rewardPoints:"", rewardValue:"",
  cashbackAmount:"", cashbackSource:"UPI Offer",
  // wallet load fields
  walletTarget:"",
});

// ─── Supabase Config ─────────────────────────────────────────────
const SUPABASE_URL = "https://jmdyyrojpbercquifzgs.supabase.co";
const SUPABASE_KEY = "sb_publishable_senHrM1gvOCRrrXvHCGs-A_WQ7Cbtlu";

const supabase = {
  async from(table) {
    const base = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    };
    return {
      async select() {
        const r = await fetch(`${base}?select=*`, { headers });
        return r.json();
      },
      async upsert(data) {
        const r = await fetch(base, {
          method: "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(data),
        });
        return r.json();
      },
      async delete(match) {
        const params = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join("&");
        await fetch(`${base}?${params}`, { method: "DELETE", headers });
      },
      async deleteAll() {
        await fetch(`${base}?id=gte.0`, { method: "DELETE", headers });
      },
    };
  }
};

// ─── Storage ─────────────────────────────────────────────────────
const storage = {
  async get(k) {
    try {
      const db = await supabase.from("settings");
      const rows = await db.select();
      const row = rows.find(r => r.key === k);
      return row ? JSON.parse(row.value) : null;
    } catch { return null; }
  },
  async set(k, v) {
    try {
      const db = await supabase.from("settings");
      await db.upsert({ key: k, value: JSON.stringify(v) });
    } catch {}
  },
};

// ─── Sub-components ───────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:0.7, marginBottom:6 }}>
    {children}
  </div>
);

const Input = ({ style, ...props }) => (
  <input {...props} style={{
    width:"100%", border:`2px solid ${C.border}`, borderRadius:13, padding:"12px 14px",
    fontSize:14, fontFamily:"inherit", color:C.text, outline:"none",
    boxSizing:"border-box", background:"#fff", ...style
  }} />
);

const Select = ({ style, children, ...props }) => (
  <select {...props} style={{
    width:"100%", border:`2px solid ${C.border}`, borderRadius:13, padding:"12px 14px",
    fontSize:14, fontFamily:"inherit", color:C.text, outline:"none",
    background:"#fff", boxSizing:"border-box", appearance:"none",
    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238898AA' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center", paddingRight:36, ...style
  }}>{children}</select>
);

const Pill = ({ active, color = C.green, onClick, children }) => (
  <button onClick={onClick} style={{
    border:"none", borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:700,
    cursor:"pointer", transition:"all 0.18s", whiteSpace:"nowrap",
    background: active ? color : C.bg,
    color: active ? "#fff" : C.muted,
  }}>{children}</button>
);

const Card = ({ children, style }) => (
  <div style={{ background:C.card, borderRadius:20, padding:"16px", boxShadow:"0 1px 12px rgba(0,0,0,0.06)", marginBottom:10, ...style }}>
    {children}
  </div>
);

const Divider = () => <div style={{ height:1, background:C.border, margin:"4px 0" }} />;

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [txns,     setTxns]     = useState([]);
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [loaded,   setLoaded]   = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [ccPaid, setCcPaid] = useState({}); // {txn_id: true} = bill paid
  const [tab,      setTab]      = useState("home");   // home | add | history | reports | settings
  const [form,     setForm]     = useState(emptyForm());
  const [errors,   setErrors]   = useState({});
  const [editingId, setEditingId] = useState(null); // null = new, id = editing

  // Filters for History
  const [fChannel, setFChannel] = useState("All");
  const [fSource,  setFSource]  = useState("All");
  const [fAccount, setFAccount] = useState("All");
  const [fUpi,     setFUpi]     = useState("All");
  const [fType,    setFType]    = useState("All");

  // Reports date range
  const [rFromDate, setRFromDate] = useState("");
  const [rToDate,   setRToDate]   = useState("");

  // History search
  const [hSearch, setHSearch] = useState("");

  // CC due dates: { "HDFC Millennia": "2026-04-05", ... }
  const [ccDueDates, setCcDueDates] = useState({});

  // Settings modal
  const [settingsTab,    setSettingsTab]    = useState("bank");
  const [newItem,        setNewItem]        = useState("");
  const [delConfirm,     setDelConfirm]     = useState(null); // {id}
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [removeConfirm,  setRemoveConfirm]  = useState(null);

  // ── Persistence ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Load transactions from dedicated table
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?select=*&order=id.desc`, {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          }
        });
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          setTxns(rows.map(r => ({
            id: r.id,
            date: r.date,
            type: r.type,
            category: r.category,
            amount: r.amount,
            paymentChannel: r.paymentChannel,
            sourceType: r.sourceType,
            accountName: r.accountName,
            upiApp: r.upiApp,
            cashback_amount: r.cashback_amount,
            cashback_source: r.cashback_source,
            reward_value: r.reward_value,
            notes: r.notes,
          })));
        }
      } catch(e) { console.error("Load txns error:", e); }

      // Load settings
      const a  = await storage.get("accounts_v2");
      const ob = await storage.get("opening_balance");
      const cp = await storage.get("cc_paid");
      const cd = await storage.get("cc_due_dates");
      if (a)         setAccounts(a);
      if (ob !== null) setOpeningBalance(ob);
      if (cp)        setCcPaid(cp);
      if (cd)        setCcDueDates(cd);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const db = await supabase.from("transactions");
        // Delete all then re-insert
        await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=gte.0`, {
          method: "DELETE",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          }
        });
        if (txns.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
            method: "POST",
            headers: {
              "apikey": SUPABASE_KEY,
              "Authorization": `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify(txns.map(t => ({
              id: t.id,
              date: t.date,
              type: t.type,
              category: t.category,
              amount: t.amount,
              paymentChannel: t.paymentChannel,
              sourceType: t.sourceType,
              accountName: t.accountName,
              upiApp: t.upiApp,
              cashback_amount: t.cashback_amount,
              cashback_source: t.cashback_source,
              reward_value: t.reward_value,
              notes: t.notes,
            })))
          });
        }
      } catch(e) { console.error("Save txns error:", e); }
    })();
  }, [txns, loaded]);
  useEffect(() => { if (loaded) storage.set("accounts_v2", accounts); }, [accounts, loaded]);
  useEffect(() => { if (loaded) storage.set("opening_balance", openingBalance); }, [openingBalance, loaded]);
  useEffect(() => { if (loaded) storage.set("cc_paid", ccPaid); }, [ccPaid, loaded]);
  useEffect(() => { if (loaded) storage.set("cc_due_dates", ccDueDates); }, [ccDueDates, loaded]);

  // ── Derived ──────────────────────────────────────────────────
  const accountOptions = useMemo(() => {
    if (form.sourceType === "Bank Account") return accounts.bankAccounts;
    if (form.sourceType === "Credit Card")  return accounts.creditCards;
    if (form.sourceType === "Wallet")       return accounts.wallets;
    return [];
  }, [form.sourceType, accounts]);

  useEffect(() => {
    setForm(f => ({ ...f, accountName: accountOptions[0] || "" }));
  }, [form.sourceType]);

  // ── Edit helper ─────────────────────────────────────────────
  const handleEdit = (t) => {
    const isLoad = t.type === "wallet_load";
    setForm({
      type:           t.type,
      amount:         String(t.amount),
      category:       t.category || "Food",
      date:           t.date,
      paymentChannel: t.paymentChannel !== "—" ? t.paymentChannel : "UPI",
      sourceType:     t.sourceType     !== "—" ? t.sourceType     : "Bank Account",
      accountName:    isLoad ? "" : (t.accountName !== "—" ? t.accountName : ""),
      upiApp:         t.upiApp !== "—" ? t.upiApp : "",
      upiAppCustom:   "",
      notes:          t.notes || "",
      rewardPoints:   "",
      rewardValue:    t.reward_value   != null ? String(t.reward_value)   : "",
      cashbackAmount: t.cashback_amount != null ? String(t.cashback_amount) : "",
      cashbackSource: t.cashback_source || "UPI Offer",
      walletTarget:   isLoad ? t.accountName : "",
    });
    setEditingId(t.id);
    setErrors({});
    setTab("add");
  };

  // ── Validation & Save ────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.amount || isNaN(form.amount) || +form.amount <= 0) e.amount = "Enter a valid amount";
    if (!form.date) e.date = "Select a date";
    if (form.type === "expense") {
      if (!form.accountName) e.accountName = "Select an account/card";
      if (form.paymentChannel === "UPI" && !form.upiApp) e.upiApp = "Select UPI app";
      if (form.paymentChannel === "UPI" && form.upiApp === "Other" && !form.upiAppCustom.trim()) e.upiAppCustom = "Enter app name";
    }
    if (form.type === "wallet_load") {
      if (!form.walletTarget) e.walletTarget = "Select a wallet";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const upiAppFinal  = form.upiApp === "Other" ? form.upiAppCustom.trim() : form.upiApp;
    const isCreditCard = form.type === "expense" && form.sourceType === "Credit Card";
    const isExpense    = form.type === "expense";
    const isLoad       = form.type === "wallet_load";

    const txnData = {
      type:             form.type,
      amount:           parseFloat(form.amount),
      category:         isLoad ? "Wallet Load" : form.category,
      date:             form.date,
      paymentChannel:   isExpense ? form.paymentChannel : "—",
      sourceType:       isExpense ? form.sourceType     : "—",
      accountName:      isExpense ? form.accountName    : isLoad ? form.walletTarget : "—",
      upiApp:           isExpense && form.paymentChannel === "UPI" ? upiAppFinal : "—",
      notes:            form.notes.trim(),
      reward_points:    null,
      reward_value:     isCreditCard && form.rewardValue     !== "" ? parseFloat(form.rewardValue)     : null,
      cashback_amount:  isExpense    && form.cashbackAmount  !== "" ? parseFloat(form.cashbackAmount)  : null,
      cashback_source:  isExpense    && form.cashbackAmount  !== "" ? form.cashbackSource              : null,
    };

    if (editingId) {
      setTxns(prev => prev.map(t => t.id === editingId ? { ...t, ...txnData } : t));
      setEditingId(null);
    } else {
      setTxns(prev => [{ id: Date.now(), ...txnData }, ...prev]);
    }
    setForm(emptyForm());
    setErrors({});
    setTab("home");
  };

  // ── Filtered Transactions ────────────────────────────────────
  const filteredTxns = useMemo(() => {
    const q = hSearch.toLowerCase().trim();
    return txns.filter(t => {
      if (fType    !== "All" && t.type           !== fType)    return false;
      if (fChannel !== "All" && t.paymentChannel !== fChannel) return false;
      if (fSource  !== "All" && t.sourceType     !== fSource)  return false;
      if (fAccount !== "All" && t.accountName    !== fAccount) return false;
      if (fUpi     !== "All" && t.upiApp         !== fUpi)     return false;
      if (q) {
        const inCat     = (t.category    || "").toLowerCase().includes(q);
        const inNotes   = (t.notes       || "").toLowerCase().includes(q);
        const inAccount = (t.accountName || "").toLowerCase().includes(q);
        const inAmount  = String(t.amount).includes(q);
        if (!inCat && !inNotes && !inAccount && !inAmount) return false;
      }
      return true;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [txns, fType, fChannel, fSource, fAccount, fUpi, hSearch]);

  const expenses = txns.filter(t => t.type === "expense");
  const totalExp = expenses.reduce((s,t) => s + t.amount, 0);
  const totalInc = txns.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);

  // ── Bottom Nav ───────────────────────────────────────────────
  const NAV = [
    { id:"home",     label:"Home",    icon:<HomeIco/> },
    { id:"add",      label:"Add",     icon:<AddIco/>  },
    { id:"history",  label:"History", icon:<ListIco/> },
    { id:"reports",  label:"Reports", icon:<ChartIco/>},
    { id:"rewards",  label:"Rewards", icon:<StarIco/> },
    { id:"settings", label:"Manage",  icon:<GearIco/> },
  ];

  // ═══════════════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════════════

  // ── HOME ─────────────────────────────────────────────────────
  const HomeView = () => {
    // Credit card expenses split into paid vs unpaid
    const ccExpenses   = txns.filter(t => t.type === "expense" && t.sourceType === "Credit Card");
    const ccUnpaidAmt  = ccExpenses.filter(t => !ccPaid[t.id]).reduce((s,t) => s + t.amount, 0);
    const ccPaidAmt    = ccExpenses.filter(t =>  ccPaid[t.id]).reduce((s,t) => s + t.amount, 0);
    const nonCcExp     = txns.filter(t => t.type === "expense" && t.sourceType !== "Credit Card").reduce((s,t) => s + t.amount, 0);
    // Cash balance = opening + income - non-cc-expenses - cc-bills-already-paid
    const cashBalance  = openingBalance + totalInc - nonCcExp - ccPaidAmt;
    const net          = totalInc - totalExp;
    const recent       = txns.slice(0, 6);
    const thisMonthTxns = txns.filter(t => {
      const d = new Date(t.date);
      const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    });
    const mInc = thisMonthTxns.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
    const mExp = thisMonthTxns.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);

    const channelBreak = ["UPI","Card","Cash","Net Banking"].map(ch => ({
      ch, amt: expenses.filter(t=>t.paymentChannel===ch).reduce((s,t)=>s+t.amount,0)
    })).filter(x=>x.amt>0);

    return (
      <div>
        {/* Balance Hero */}
        <div style={{ background:`linear-gradient(150deg,${C.dark},${C.dark2})`, borderRadius:22, padding:"22px 20px 20px", marginBottom:10, color:"#fff" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:5 }}>Cash Balance</div>
          <div style={{ fontSize:38, fontWeight:900, letterSpacing:-1.5, color: cashBalance>=0 ? C.green : C.red, marginBottom:4 }}>
            {cashBalance<0?"−":""}{full(Math.abs(cashBalance))}
          </div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginBottom:14, fontWeight:500 }}>
            Opening + Income − Cash/Bank/Wallet spends − CC bills paid
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom: ccUnpaidAmt>0?10:0 }}>
            <div style={{ background:"rgba(255,255,255,0.07)", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Total Income</div>
              <div style={{ fontSize:18, fontWeight:900, color:C.green }}>{full(totalInc)}</div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.07)", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Total Expense</div>
              <div style={{ fontSize:18, fontWeight:900, color:C.red }}>{full(totalExp)}</div>
            </div>
          </div>
          {ccUnpaidAmt > 0 && (
            <div style={{ background:"rgba(255,107,107,0.18)", border:"1.5px solid rgba(255,107,107,0.35)", borderRadius:14, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,150,150,0.9)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:3 }}>💳 CC Bill Due</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:500 }}>Not yet paid to bank</div>
              </div>
              <div style={{ fontSize:20, fontWeight:900, color:"#FF9999" }}>−{full(ccUnpaidAmt)}</div>
            </div>
          )}
        </div>

        {/* This Month */}
        <Card>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>
            📅 {MONTHS_F[new Date().getMonth()]} {new Date().getFullYear()}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div style={{ background:C.greenLt, borderRadius:14, padding:"12px" }}>
              <div style={{ fontSize:10, color:C.green, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Income</div>
              <div style={{ fontSize:18, fontWeight:900, color:C.green }}>{full(mInc)}</div>
            </div>
            <div style={{ background:C.redLt, borderRadius:14, padding:"12px" }}>
              <div style={{ fontSize:10, color:C.red, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Expense</div>
              <div style={{ fontSize:18, fontWeight:900, color:C.red }}>{full(mExp)}</div>
            </div>
          </div>
        </Card>

        {/* Channel Breakdown */}
        {channelBreak.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>💳 Payment Channels</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {channelBreak.map(({ch,amt}) => (
                <div key={ch} style={{ background:PC_COLORS[ch]+"12", borderRadius:13, padding:"11px 13px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:18 }}>{PC_ICONS[ch]}</span>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:PC_COLORS[ch], textTransform:"uppercase" }}>{ch}</div>
                    <div style={{ fontSize:14, fontWeight:900, color:C.text }}>{fmt(amt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* CC Due Date Reminders */}
        {(() => {
          const nowDay = new Date(); nowDay.setHours(0,0,0,0);
          const alerts = accounts.creditCards.filter(card => {
            if (!ccDueDates[card]) return false;
            const due = new Date(ccDueDates[card]); due.setHours(0,0,0,0);
            const diff = Math.ceil((due - nowDay) / (1000*60*60*24));
            const hasUnpaid = txns.some(t => t.type==="expense" && t.sourceType==="Credit Card" && t.accountName===card && !ccPaid[t.id]);
            return diff <= 5 && diff >= 0 && hasUnpaid;
          }).map(card => {
            const due = new Date(ccDueDates[card]); due.setHours(0,0,0,0);
            const diff = Math.ceil((due - nowDay) / (1000*60*60*24));
            const amt  = txns.filter(t => t.type==="expense" && t.sourceType==="Credit Card" && t.accountName===card && !ccPaid[t.id]).reduce((s,t)=>s+t.amount,0);
            return { card, diff, amt };
          });
          if (alerts.length === 0) return null;
          return (
            <div style={{ marginBottom:10 }}>
              {alerts.map(({card, diff, amt}) => (
                <div key={card} style={{
                  background: diff===0 ? C.red : diff<=2 ? "#FF8C42" : C.yellow,
                  borderRadius:16, padding:"12px 16px", marginBottom:6,
                  display:"flex", justifyContent:"space-between", alignItems:"center"
                }}>
                  <div>
                    <div style={{ color:"#fff", fontWeight:900, fontSize:13 }}>
                      {diff===0 ? "🚨 DUE TODAY" : diff<=2 ? `⚠️ Due in ${diff} day${diff>1?"s":""}` : `🔔 Due in ${diff} days`} — {card}
                    </div>
                    <div style={{ color:"rgba(255,255,255,0.75)", fontSize:11, marginTop:2 }}>Unpaid: {full(amt)}</div>
                  </div>
                  <div style={{ color:"#fff", fontWeight:900, fontSize:15 }}>{full(amt)}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* CC Outstanding */}
        {ccUnpaidAmt > 0 && (
          <Card style={{ padding:"14px 16px 8px", border:`1.5px solid ${C.red}22` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontWeight:800, fontSize:14 }}>💳 CC Outstanding</div>
              <div style={{ background:C.redLt, color:C.red, borderRadius:10, padding:"3px 10px", fontSize:12, fontWeight:800 }}>Due: {full(ccUnpaidAmt)}</div>
            </div>
            {accounts.creditCards.map(card => {
              const cardTxns = ccExpenses.filter(t => t.accountName === card && !ccPaid[t.id]);
              const cardAmt  = cardTxns.reduce((s,t) => s + t.amount, 0);
              if (cardAmt === 0) return null;
              return (
                <div key={card} style={{ marginBottom:10, background:C.redLt, borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontWeight:800, fontSize:13 }}>💳 {card}</div>
                    <div style={{ fontWeight:900, fontSize:15, color:C.red }}>−{full(cardAmt)}</div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>{cardTxns.length} unpaid transaction{cardTxns.length!==1?"s":""}</div>
                  <button onClick={() => {
                    const updates = {};
                    cardTxns.forEach(t => { updates[t.id] = true; });
                    setCcPaid(p => ({ ...p, ...updates }));
                  }} style={{
                    width:"100%", border:"none", borderRadius:10, padding:"9px",
                    background:`linear-gradient(135deg,${C.red},#E04545)`,
                    color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer",
                    boxShadow:"0 3px 10px rgba(255,107,107,0.35)"
                  }}>✅ Mark Bill Paid — {full(cardAmt)}</button>
                </div>
              );
            })}
          </Card>
        )}

        {/* Recent Transactions */}
        <Card style={{ padding:"16px 16px 4px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>Recent</div>
            {txns.length > 6 && (
              <button onClick={()=>setTab("history")} style={{ border:"none", background:"none", color:C.green, fontWeight:700, fontSize:12, cursor:"pointer" }}>See all →</button>
            )}
          </div>
          {recent.length === 0
            ? <Empty msg="No transactions yet" onAdd={()=>setTab("add")} />
            : recent.map(t => <TxnRow key={t.id} t={t} onDelete={id=>setDelConfirm(id)} />)
          }
        </Card>
      </div>
    );
  };

  // ── ADD ──────────────────────────────────────────────────────
  const AddView = () => {
    const isLoad    = form.type === "wallet_load";
    const isIncome  = form.type === "income";
    const isExpense = form.type === "expense";

    const err = (f) => errors[f] ? (
      <div style={{ color:C.red, fontSize:11, fontWeight:600, marginTop:4 }}>⚠ {errors[f]}</div>
    ) : null;

    return (
      <div>
        <Card>
          {/* Type Selector */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:20 }}>
            {[
              { v:"expense", color:C.red,    content: <span>↓ Expense</span> },
              { v:"income",  color:C.green,  content: <span>↑ Income</span>  },
              { v:"wallet_load", color:C.yellow, content: <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><WalletIco size={15} color={form.type==="wallet_load"?"#fff":"#FFB800"}/> Wallet</span> },
            ].map(({v,color,content}) => (
              <button key={v} onClick={()=>setForm(f=>({...f,type:v}))} style={{
                border:"none", borderRadius:13, padding:"11px 4px", fontWeight:800, fontSize:12,
                cursor:"pointer", transition:"all 0.18s",
                background: form.type===v ? color : C.bg,
                color: form.type===v ? "#fff" : C.muted,
                boxShadow: form.type===v ? `0 3px 12px ${color}40` : "none",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>{content}</button>
            ))}
          </div>

          {/* Amount */}
          <div style={{ marginBottom:16 }}>
            <Label>Amount</Label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontWeight:900, color:C.muted, fontSize:22, pointerEvents:"none" }}>₹</span>
              <Input type="number" inputMode="decimal" placeholder="0.00"
                value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                style={{ paddingLeft:40, fontSize:28, fontWeight:900, border:`2px solid ${errors.amount?C.red:C.border}` }} />
            </div>
            {err("amount")}
          </div>

          {/* Date */}
          <div style={{ marginBottom:16 }}>
            <Label>Date</Label>
            <Input type="date" value={form.date}
              onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              style={{ border:`2px solid ${errors.date?C.red:C.border}` }} />
            {err("date")}
          </div>

          {/* Wallet Load fields */}
          {isLoad && (
            <div style={{ marginBottom:16 }}>
              <Label>Load to Wallet</Label>
              {accounts.wallets.length > 0 ? (
                <Select value={form.walletTarget} onChange={e=>setForm(f=>({...f,walletTarget:e.target.value}))}
                  style={{ border:`2px solid ${errors.walletTarget?C.red:C.border}` }}>
                  <option value="">Select wallet...</option>
                  {accounts.wallets.map(w=><option key={w}>{w}</option>)}
                </Select>
              ) : (
                <div style={{ padding:"12px 14px", background:C.bg, borderRadius:13, color:C.muted, fontSize:13 }}>
                  No wallets added. Go to <strong>Manage</strong> tab.
                </div>
              )}
              {err("walletTarget")}
            </div>
          )}

          {/* Expense / Income fields */}
          {!isLoad && (
            <>
              {/* Category */}
              <div style={{ marginBottom:16 }}>
                <Label>Category</Label>
                <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:4 }}>
                  {(isIncome ? INC_CATS : EXP_CATS).map(c => (
                    <button key={c} onClick={()=>setForm(f=>({...f,category:c}))} style={{
                      border:"none", borderRadius:20, padding:"6px 13px", fontSize:12, fontWeight:700,
                      cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s",
                      background: form.category===c ? C.green : C.bg,
                      color: form.category===c ? "#fff" : C.muted,
                    }}>{CAT_ICONS[c]||"•"} {c}</button>
                  ))}
                </div>
              </div>

              {/* Payment fields - expense only */}
              {isExpense && (
                <>
                  <div style={{ marginBottom:16 }}>
                    <Label>Payment Channel</Label>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
                      {["UPI","Card","Cash","Net Banking"].map(ch => (
                        <button key={ch} onClick={()=>setForm(f=>({...f,paymentChannel:ch}))} style={{
                          border:"none", borderRadius:12, padding:"9px 4px", fontSize:11, fontWeight:700,
                          cursor:"pointer", transition:"all 0.15s",
                          background: form.paymentChannel===ch ? PC_COLORS[ch] : C.bg,
                          color: form.paymentChannel===ch ? "#fff" : C.muted,
                        }}>{PC_ICONS[ch]}<br/>{ch}</button>
                      ))}
                    </div>
                  </div>

                  {/* UPI App */}
                  {form.paymentChannel === "UPI" && (
                    <div style={{ marginBottom:16 }}>
                      <Label>UPI App</Label>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {UPI_APPS.map(u => (
                          <button key={u} onClick={()=>setForm(f=>({...f,upiApp:u}))} style={{
                            border:`2px solid ${form.upiApp===u?C.blue:C.border}`, borderRadius:10, padding:"7px 13px",
                            fontSize:12, fontWeight:700, cursor:"pointer", background: form.upiApp===u?C.blueLt:"#fff",
                            color: form.upiApp===u?C.blue:C.muted,
                          }}>{u}</button>
                        ))}
                      </div>
                      {err("upiApp")}
                      {form.upiApp === "Other" && (
                        <div style={{ marginTop:10 }}>
                          <Input placeholder="App name" value={form.upiAppCustom}
                            onChange={e=>setForm(f=>({...f,upiAppCustom:e.target.value}))}
                            style={{ border:`2px solid ${errors.upiAppCustom?C.red:C.border}` }} />
                          {err("upiAppCustom")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Source Type */}
                  {form.paymentChannel !== "Cash" && (
                    <div style={{ marginBottom:16 }}>
                      <Label>Source Type</Label>
                      <div style={{ display:"flex", gap:6 }}>
                        {[
                          { st:"Bank Account", icon: "🏦" },
                          { st:"Credit Card",  icon: "💳" },
                          { st:"Wallet",       icon: null  },
                        ].map(({st, icon}) => (
                          <button key={st} onClick={()=>setForm(f=>({...f,sourceType:st}))} style={{
                            flex:1, border:`2px solid ${form.sourceType===st?C.purple:C.border}`,
                            borderRadius:10, padding:"8px 4px", fontSize:11, fontWeight:700,
                            cursor:"pointer", background: form.sourceType===st?C.purpleLt:"#fff",
                            color: form.sourceType===st?C.purple:C.muted,
                            display:"flex", alignItems:"center", justifyContent:"center", gap:4,
                          }}>
                            {icon ? <span>{icon}</span> : <WalletIco size={14} color="#FFB800"/>}
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Account Name */}
                  {form.paymentChannel !== "Cash" && (
                    <div style={{ marginBottom:16 }}>
                      <Label>{form.sourceType}</Label>
                      {accountOptions.length > 0 ? (
                        <Select value={form.accountName} onChange={e=>setForm(f=>({...f,accountName:e.target.value}))}
                          style={{ border:`2px solid ${errors.accountName?C.red:C.border}` }}>
                          <option value="">Select...</option>
                          {accountOptions.map(a=><option key={a}>{a}</option>)}
                        </Select>
                      ) : (
                        <div style={{ padding:"12px 14px", background:C.bg, borderRadius:13, color:C.muted, fontSize:13 }}>
                          No {form.sourceType.toLowerCase()}s added. Go to <strong>Manage</strong> tab.
                        </div>
                      )}
                      {err("accountName")}
                    </div>
                  )}

                  {/* CC Rewards */}
                  {form.sourceType === "Credit Card" && (
                    <>
                      <Divider />
                      <div style={{ fontSize:12, color:"#FFB800", fontWeight:700, margin:"12px 0 14px", textTransform:"uppercase", letterSpacing:0.7, display:"flex", alignItems:"center", gap:6 }}>
                        <span>⭐</span> Reward Value (Optional)
                      </div>
                      <div style={{ background:"#FFFBF0", border:"1.5px solid #FFE8A0", borderRadius:16, padding:"14px", marginBottom:16 }}>
                        <Label>Reward Value (₹)</Label>
                        <div style={{ position:"relative" }}>
                          <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontWeight:800, color:C.muted, fontSize:18, pointerEvents:"none" }}>₹</span>
                          <Input type="number" placeholder="e.g. 25" value={form.rewardValue}
                            onChange={e => setForm(f => ({ ...f, rewardValue: e.target.value }))}
                            style={{ paddingLeft:38, fontSize:20, fontWeight:900 }} />
                        </div>
                        {parseFloat(form.rewardValue) > 0 && (
                          <div style={{ background:"#FFF3C4", borderRadius:10, padding:"8px 12px", marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#7A5C00" }}>⭐ Reward on this transaction</span>
                            <span style={{ fontSize:15, fontWeight:900, color:"#E6A000" }}>+₹{parseFloat(form.rewardValue).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Cashback */}
                  <Divider />
                  <div style={{ fontSize:12, color:C.green, fontWeight:700, margin:"12px 0 14px", textTransform:"uppercase", letterSpacing:0.7, display:"flex", alignItems:"center", gap:6 }}>
                    <span>🎁</span> Cashback & Offers <span style={{ fontSize:10, color:C.muted, textTransform:"none", fontWeight:500 }}>(optional)</span>
                  </div>
                  <div style={{ background:C.greenLt, border:`1.5px solid ${C.green}33`, borderRadius:16, padding:"14px 14px 10px", marginBottom:4 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                      <div>
                        <Label>Cashback (₹)</Label>
                        <div style={{ position:"relative" }}>
                          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontWeight:800, color:C.muted, fontSize:14, pointerEvents:"none" }}>₹</span>
                          <Input type="number" placeholder="0.00" value={form.cashbackAmount}
                            onChange={e=>setForm(f=>({...f,cashbackAmount:e.target.value}))}
                            style={{ paddingLeft:26, fontSize:15, fontWeight:800, padding:"10px 12px 10px 26px" }} />
                        </div>
                      </div>
                      <div>
                        <Label>Source</Label>
                        <Select value={form.cashbackSource} onChange={e=>setForm(f=>({...f,cashbackSource:e.target.value}))}
                          style={{ padding:"10px 30px 10px 12px", fontSize:13 }}>
                          {CASHBACK_SOURCES.map(s=><option key={s}>{s}</option>)}
                        </Select>
                      </div>
                    </div>
                    {parseFloat(form.cashbackAmount)>0&&(
                      <div style={{ background:"rgba(0,208,156,0.12)", borderRadius:10, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"#007A5E" }}>🎁 Cashback</span>
                        <span style={{ fontSize:15, fontWeight:900, color:C.green }}>+₹{parseFloat(form.cashbackAmount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Notes */}
          <div style={{ marginBottom:20, marginTop:16 }}>
            <Label>Notes (Optional)</Label>
            <Input placeholder={isLoad?"e.g. Loaded from Amazon Gift Card":"e.g. Monthly rent, Zomato order..."} value={form.notes}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
          </div>

          {/* Save */}
          <button onClick={handleSave} style={{
            width:"100%", border:"none", borderRadius:16, padding:"15px",
            background: isLoad
              ? `linear-gradient(135deg,${C.yellow},#E69500)`
              : form.type==="income"
                ? `linear-gradient(135deg,${C.green},${C.greenDk})`
                : `linear-gradient(135deg,#FF6B6B,#E04545)`,
            color:"#fff", fontWeight:900, fontSize:16, cursor:"pointer",
            boxShadow: isLoad ? "0 4px 20px rgba(255,184,0,0.4)"
              : form.type==="income" ? "0 4px 20px rgba(0,208,156,0.4)"
              : "0 4px 20px rgba(255,107,107,0.35)",
          }}>
            {editingId
              ? "✅ Save Changes"
            : isLoad ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><WalletIco size={18}/> Load Wallet</span>
              : form.type==="income" ? "↑ Save Income"
              : "↓ Save Expense"}
          </button>
        </Card>
      </div>
    );
  };

  // ── HISTORY ──────────────────────────────────────────────────
  const HistoryView = () => {
    const allChannels = [...new Set(expenses.map(t=>t.paymentChannel).filter(x=>x!=="—"))];
    const allSources  = [...new Set(expenses.map(t=>t.sourceType).filter(x=>x!=="—"))];
    const allAccounts = [...new Set(expenses.map(t=>t.accountName).filter(x=>x!=="—"))];
    const allUpi      = [...new Set(expenses.map(t=>t.upiApp).filter(x=>x&&x!=="—"))];

    const groups = {};
    filteredTxns.forEach(t => {
      const d = new Date(t.date);
      const k = `${MONTHS_F[d.getMonth()]} ${d.getFullYear()}`;
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });

    const resetFilters = () => { setFChannel("All"); setFSource("All"); setFAccount("All"); setFUpi("All"); setFType("All"); };
    const activeFilters = [fType,fChannel,fSource,fAccount,fUpi].filter(x=>x!=="All").length;

    return (
      <div>
        {/* Search Bar */}
        <div style={{ position:"relative", marginBottom:10 }}>
          <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>🔍</span>
          <input
            type="text"
            placeholder="Search by category, note, account, amount..."
            value={hSearch}
            onChange={e => setHSearch(e.target.value)}
            style={{
              width:"100%", border:`2px solid ${hSearch ? C.green : C.border}`, borderRadius:14,
              padding:"12px 40px 12px 40px", fontSize:13, fontFamily:"inherit",
              color:C.text, outline:"none", boxSizing:"border-box", background:"#fff",
            }}
          />
          {hSearch && (
            <button onClick={() => setHSearch("")} style={{
              position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
              border:"none", background:C.border, borderRadius:"50%",
              width:22, height:22, cursor:"pointer", fontSize:12, fontWeight:800, color:C.muted,
              display:"flex", alignItems:"center", justifyContent:"center", padding:0,
            }}>✕</button>
          )}
        </div>

        <Card style={{ padding:"14px 14px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>Filters {activeFilters>0 && <span style={{ background:C.red, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:11, marginLeft:4 }}>{activeFilters}</span>}</div>
            {activeFilters>0 && <button onClick={resetFilters} style={{ border:"none", background:"none", color:C.red, fontWeight:700, cursor:"pointer", fontSize:12 }}>Clear all</button>}
          </div>
          <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:4 }}>
            <Pill active={fType==="All"}          onClick={()=>setFType("All")}>All</Pill>
            <Pill active={fType==="expense"}       color={C.red}    onClick={()=>setFType("expense")}>↓ Expense</Pill>
            <Pill active={fType==="income"}        color={C.green}  onClick={()=>setFType("income")}>↑ Income</Pill>
            <Pill active={fType==="wallet_load"}   color={C.yellow} onClick={()=>setFType("wallet_load")}><span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><WalletIco size={13} color={fType==="wallet_load"?"#fff":"#FFB800"}/> Wallet</span></Pill>
          </div>
          {allChannels.length > 0 && (
            <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:4, marginTop:6 }}>
              <Pill active={fChannel==="All"} onClick={()=>setFChannel("All")}>All Channels</Pill>
              {allChannels.map(ch => <Pill key={ch} active={fChannel===ch} color={PC_COLORS[ch]} onClick={()=>setFChannel(ch)}>{PC_ICONS[ch]} {ch}</Pill>)}
            </div>
          )}
          {allSources.length > 0 && (
            <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:4, marginTop:6 }}>
              <Pill active={fSource==="All"} onClick={()=>setFSource("All")}>All Sources</Pill>
              {allSources.map(s => <Pill key={s} active={fSource===s} color={C.purple} onClick={()=>setFSource(s)}>{s}</Pill>)}
            </div>
          )}
          {allAccounts.length > 0 && (
            <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:4, marginTop:6 }}>
              <Pill active={fAccount==="All"} onClick={()=>setFAccount("All")}>All Accounts</Pill>
              {allAccounts.map(a => <Pill key={a} active={fAccount===a} color={C.blue} onClick={()=>setFAccount(a)}>{a}</Pill>)}
            </div>
          )}
          {allUpi.length > 0 && (
            <div style={{ overflowX:"auto", display:"flex", gap:6, paddingBottom:2, marginTop:6 }}>
              <Pill active={fUpi==="All"} onClick={()=>setFUpi("All")}>All UPI Apps</Pill>
              {allUpi.map(u => <Pill key={u} active={fUpi===u} color={C.blue} onClick={()=>setFUpi(u)}>{u}</Pill>)}
            </div>
          )}
        </Card>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, marginLeft:2 }}>
          <div style={{ fontSize:12, color:C.muted, fontWeight:600 }}>
            {filteredTxns.length} transaction{filteredTxns.length!==1?"s":""}
          </div>
          {filteredTxns.length > 0 && (
            <button onClick={() => {
              const headers = ["Date","Type","Category","Amount","Payment","Source","Account","UPI App","Cashback","Notes"];
              const rows = filteredTxns.map(t => [
                t.date, t.type, t.category, t.amount,
                t.paymentChannel, t.sourceType, t.accountName, t.upiApp||"",
                t.cashback_amount||"", t.notes||""
              ]);
              const esc = v => String(v).split('"').join('""');
              const csv = [headers, ...rows].map(r => r.map(v => '"' + esc(v) + '"').join(",")).join("\n");
              const blob = new Blob([csv], { type:"text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = "minhaj-transactions-" + new Date().toISOString().split("T")[0] + ".csv";
              a.click(); URL.revokeObjectURL(url);
            }} style={{
              border:"none", borderRadius:10, padding:"6px 14px",
              background:C.dark, color:"#fff",
              fontSize:12, fontWeight:700, cursor:"pointer",
              display:"flex", alignItems:"center", gap:5,
            }}>⬇️ Export CSV</button>
          )}
        </div>

        {filteredTxns.length === 0
          ? <Card><Empty msg="No transactions match your filters" onAdd={()=>setTab("add")} /></Card>
          : Object.entries(groups).map(([label, list]) => {
              const inc = list.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
              const exp = list.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
              return (
                <Card key={label} style={{ padding:"14px 14px 4px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontWeight:800, fontSize:13, color:C.text }}>{label}</div>
                    <div style={{ fontSize:12 }}>
                      {inc>0 && <span style={{ color:C.green, fontWeight:700 }}>+{fmt(inc)} </span>}
                      {exp>0 && <span style={{ color:C.red, fontWeight:700 }}>−{fmt(exp)}</span>}
                    </div>
                  </div>
                  {list.map(t => <TxnRow key={t.id} t={t} detailed onDelete={id=>setDelConfirm(id)} onEdit={handleEdit} />)}
                </Card>
              );
            })
        }
      </div>
    );
  };

  // ── REPORTS ──────────────────────────────────────────────────
  const ReportsView = () => {
    if (expenses.length === 0) return <Card><Empty msg="Add transactions to see reports" onAdd={()=>setTab("add")} /></Card>;

    // Date range filter
    const inRange = (t) => {
      if (!rFromDate && !rToDate) return true;
      const d = t.date;
      if (rFromDate && d < rFromDate) return false;
      if (rToDate   && d > rToDate)   return false;
      return true;
    };

    const rangeLabel = rFromDate || rToDate
      ? `${rFromDate ? isoToLabel(rFromDate) : "Start"} → ${rToDate ? isoToLabel(rToDate) : "Today"}`
      : "All Time";

    const filteredForReport = txns.filter(inRange);
    const filtExpenses = filteredForReport.filter(t => t.type === "expense");
    const filtIncome   = filteredForReport.filter(t => t.type === "income");
    const filtTotalExp = filtExpenses.reduce((s,t) => s + t.amount, 0);
    const filtTotalInc = filtIncome.reduce((s,t) => s + t.amount, 0);

    const now = new Date();
    const monthly = Array.from({length:6}).map((_,i) => {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const mt = filteredForReport.filter(t => { const td=new Date(t.date); return td.getFullYear()===d.getFullYear()&&td.getMonth()===d.getMonth(); });
      return {
        month:   MONTHS_S[d.getMonth()],
        income:  mt.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),
        expense: mt.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),
      };
    }).reverse();

    const SOURCE_CONFIG = [
      { key:"Credit Card",  icon:"💳", color:C.purple  },
      { key:"Bank Account", icon:"🏦", color:C.blue    },
      { key:"Wallet",       icon:"👜", color:C.yellow  },
      { key:"Cash",         icon:"💵", color:C.green   },
    ];
    const bySource = SOURCE_CONFIG.map(s => ({
      ...s,
      value: filtExpenses.filter(t => t.sourceType === s.key).reduce((sum,t) => sum + t.amount, 0),
    })).filter(s => s.value > 0);
    const maxSource = bySource.reduce((m,s) => Math.max(m, s.value), 0);

    const ccBreak = accounts.creditCards.map(card => ({
      name: card,
      amt:  filtExpenses.filter(t=>t.accountName===card).reduce((s,t)=>s+t.amount,0),
    })).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);

    const baBreak = accounts.bankAccounts.map(ba => ({
      name: ba,
      amt:  filtExpenses.filter(t=>t.accountName===ba).reduce((s,t)=>s+t.amount,0),
    })).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);

    const BarItem = ({ label, amt, max, color, icon }) => (
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:600, marginBottom:6 }}>
          <span>{icon} {label}</span>
          <span style={{ color, fontWeight:800 }}>{full(amt)}</span>
        </div>
        <div style={{ background:C.border, borderRadius:6, height:6 }}>
          <div style={{ height:"100%", width:`${max>0?(amt/max)*100:0}%`, background:color, borderRadius:6, transition:"width 0.7s ease" }} />
        </div>
      </div>
    );

    // Category pie
    const catData = EXP_CATS.map(c => ({
      name: c,
      value: filtExpenses.filter(t=>t.category===c).reduce((s,t)=>s+t.amount,0),
    })).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,8);

    return (
      <div>
        {/* Date Range Picker */}
        <Card style={{ padding:"14px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>📅 Date Range</div>
            {(rFromDate || rToDate) && (
              <button onClick={()=>{ setRFromDate(""); setRToDate(""); }} style={{
                border:"none", background:C.redLt, color:C.red,
                borderRadius:10, padding:"4px 12px", fontSize:12, fontWeight:700, cursor:"pointer"
              }}>Clear</button>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <Label>From</Label>
              <Input type="date" value={rFromDate} onChange={e=>setRFromDate(e.target.value)}
                max={rToDate || today()} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={rToDate} onChange={e=>setRToDate(e.target.value)}
                min={rFromDate} max={today()} />
            </div>
          </div>
          {(rFromDate || rToDate) && (
            <div style={{ marginTop:10, background:C.greenLt, borderRadius:10, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.green }}>📊 {rangeLabel}</span>
              <span style={{ fontSize:12, fontWeight:700, color:C.text }}>
                <span style={{ color:C.green }}>+{fmt(filtTotalInc)}</span>
                {"  "}
                <span style={{ color:C.red }}>−{fmt(filtTotalExp)}</span>
              </span>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>📊 Last 6 Months</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="month" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false} tickFormatter={fmt} width={34} />
              <Tooltip formatter={v=>full(v)} contentStyle={{borderRadius:12,border:"none",fontSize:12,fontFamily:"inherit"}} />
              <Bar dataKey="income"  fill={C.green} radius={[4,4,0,0]} maxBarSize={14} />
              <Bar dataKey="expense" fill={C.red}   radius={[4,4,0,0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:8 }}>
            <span style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, borderRadius:3, background:C.green, display:"inline-block" }} /> Income</span>
            <span style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, borderRadius:3, background:C.red,   display:"inline-block" }} /> Expense</span>
          </div>
        </Card>

        {catData.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>🥧 Spend by Category</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {catData.map((_,i) => <Cell key={i} fill={PIE_PAL[i % PIE_PAL.length]} />)}
                </Pie>
                <Tooltip formatter={v=>full(v)} contentStyle={{borderRadius:12,border:"none",fontSize:12,fontFamily:"inherit"}} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
              {catData.map((c,i) => (
                <span key={c.name} style={{ fontSize:11, fontWeight:700, color:PIE_PAL[i%PIE_PAL.length], background:PIE_PAL[i%PIE_PAL.length]+"15", borderRadius:8, padding:"3px 8px" }}>
                  {CAT_ICONS[c.name]} {c.name} {fmt(c.value)}
                </span>
              ))}
            </div>
          </Card>
        )}

        {bySource.length > 0 && (
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>💰 Spend by Source</div>
              <div style={{ background:C.redLt, color:C.red, borderRadius:10, padding:"3px 10px", fontSize:12, fontWeight:800 }}>{fmt(filtTotalExp)}</div>
            </div>
            {bySource.map(s => <BarItem key={s.key} label={s.key} amt={s.value} max={maxSource} color={s.color} icon={s.icon} />)}
          </Card>
        )}

        {ccBreak.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>💳 Credit Card Breakdown</div>
            {ccBreak.map(c => <BarItem key={c.name} label={c.name} amt={c.amt} max={ccBreak[0].amt} color={C.purple} icon="💳" />)}
          </Card>
        )}

        {baBreak.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>🏦 Bank Account Breakdown</div>
            {baBreak.map(b => <BarItem key={b.name} label={b.name} amt={b.amt} max={baBreak[0].amt} color={C.blue} icon="🏦" />)}
          </Card>
        )}
      </div>
    );
  };

  // ── REWARDS ──────────────────────────────────────────────────
  const RewardsView = () => {
    const totalCashback = txns.reduce((s,t) => s + (t.cashback_amount||0), 0);
    const totalRewards  = txns.reduce((s,t) => s + (t.reward_value||0), 0);
    const totalSavings  = totalCashback + totalRewards;

    const cbBySource = CASHBACK_SOURCES.map(src => ({
      src,
      amt: txns.filter(t=>t.cashback_source===src).reduce((s,t)=>s+(t.cashback_amount||0),0),
    })).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);

    const rwByCard = accounts.creditCards.map(card => ({
      card,
      amt: txns.filter(t=>t.accountName===card).reduce((s,t)=>s+(t.reward_value||0),0),
    })).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);

    if (totalSavings === 0) return <Card><Empty msg="No rewards or cashback yet. Add transactions with cashback/rewards to see them here." onAdd={()=>setTab("add")} /></Card>;

    return (
      <div>
        <div style={{ background:`linear-gradient(135deg,#FFB800,#E69500)`, borderRadius:22, padding:"22px 20px", marginBottom:10, color:"#fff" }}>
          <div style={{ fontSize:11, opacity:0.7, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:5 }}>Total Savings</div>
          <div style={{ fontSize:38, fontWeight:900 }}>{full(totalSavings)}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:16 }}>
            <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:14, padding:"12px" }}>
              <div style={{ fontSize:10, opacity:0.7, fontWeight:700, marginBottom:4 }}>CASHBACK</div>
              <div style={{ fontSize:20, fontWeight:900 }}>{full(totalCashback)}</div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:14, padding:"12px" }}>
              <div style={{ fontSize:10, opacity:0.7, fontWeight:700, marginBottom:4 }}>REWARDS</div>
              <div style={{ fontSize:20, fontWeight:900 }}>{full(totalRewards)}</div>
            </div>
          </div>
        </div>

        {cbBySource.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>🎁 Cashback by Source</div>
            {cbBySource.map(({src,amt}) => (
              <div key={src} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontWeight:700, fontSize:13 }}>{src}</span>
                <span style={{ fontWeight:800, color:C.green, fontSize:14 }}>+{full(amt)}</span>
              </div>
            ))}
          </Card>
        )}

        {rwByCard.length > 0 && (
          <Card>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>⭐ Rewards by Card</div>
            {rwByCard.map(({card,amt}) => (
              <div key={card} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontWeight:700, fontSize:13 }}>💳 {card}</span>
                <span style={{ fontWeight:800, color:C.yellow, fontSize:14 }}>+{full(amt)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    );
  };

  // ── SETTINGS ─────────────────────────────────────────────────
  const SettingsView = () => {

    const tabs = [
      { id:"bank",   label:"Banks",   icon:"🏦", list: accounts.bankAccounts,  key:"bankAccounts"  },
      { id:"card",   label:"Cards",   icon:"💳", list: accounts.creditCards,   key:"creditCards"   },
      { id:"wallet", label:"Wallets", icon:<WalletIco size={18} color="#FFB800"/>, list: accounts.wallets, key:"wallets" },
    ];
    const active    = tabs.find(t=>t.id===settingsTab);
    const typeLabel = active.label.slice(0,-1); // remove trailing 's'
    const typeIcon  = active.icon;
    const placeholder = settingsTab==="bank" ? "e.g. Kotak Savings" : settingsTab==="card" ? "e.g. Axis Magnus" : "e.g. MobiKwik";

    const addItem = () => {
      const v = newItem.trim();
      if (!v) return;
      setAccounts(a => ({ ...a, [active.key]: [...a[active.key], v] }));
      setNewItem("");
      setShowAddModal(false);
    };

    const confirmRemove = (item) => setRemoveConfirm({ item, tab: settingsTab });
    const doRemove = () => {
      if (!removeConfirm) return;
      setAccounts(a => ({ ...a, [active.key]: a[active.key].filter(x=>x!==removeConfirm.item) }));
      setRemoveConfirm(null);
    };

    return (
      <div>
        {/* Opening Balance Card */}
        <Card style={{ padding:"16px" }}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:4 }}>💰 Opening Balance</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
            Your existing balance at the start of the financial year. This won't be counted as income — it's just your starting point.
          </div>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontWeight:900, color:C.muted, fontSize:20, pointerEvents:"none" }}>₹</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={openingBalance || ""}
              onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
              style={{
                width:"100%", border:`2px solid ${C.border}`, borderRadius:13, padding:"12px 14px 12px 40px",
                fontSize:22, fontWeight:900, fontFamily:"inherit", color:C.text, outline:"none",
                boxSizing:"border-box", background:"#fff",
              }}
            />
          </div>
          {openingBalance > 0 && (
            <div style={{ marginTop:10, background:C.greenLt, borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.green }}>✅ Opening Balance Set</span>
              <span style={{ fontSize:16, fontWeight:900, color:C.green }}>{full(openingBalance)}</span>
            </div>
          )}
        </Card>

        {/* Tab Strip */}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setSettingsTab(t.id)} style={{
              flex:1, border:"none", borderRadius:14, padding:"11px 4px", fontWeight:800, fontSize:13,
              cursor:"pointer", transition:"all 0.18s",
              background: settingsTab===t.id ? C.green : C.card,
              color: settingsTab===t.id ? "#fff" : C.muted,
              boxShadow: settingsTab===t.id ? `0 3px 12px ${C.green}40` : "0 1px 6px rgba(0,0,0,0.05)",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        <Card style={{ padding:"16px 16px 8px" }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>{typeIcon} Your {active.label}</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>{active.list.length} {active.label.toLowerCase()} added</div>

          {active.list.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"28px 0 20px", fontSize:13 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
              No {typeLabel.toLowerCase()}s added yet
            </div>
          ) : (
            active.list.map((item, idx) => (
              <div key={item} style={{ padding:"13px 0", borderBottom: idx < active.list.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{
                      width:40, height:40, borderRadius:12,
                      background: settingsTab==="bank" ? C.blueLt : settingsTab==="card" ? C.purpleLt : C.yellowLt,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:18
                    }}>{settingsTab==="bank" ? "🏦" : settingsTab==="card" ? "💳" : <WalletIco size={20} color="#FFB800"/>}</div>
                    <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{item}</span>
                  </div>
                  <button onClick={() => confirmRemove(item)} style={{
                    border:"none", background:C.redLt, color:C.red,
                    borderRadius:10, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer"
                  }}>Remove</button>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* CC Due Date Section - only for cards tab */}
        {settingsTab === "card" && accounts.creditCards.length > 0 && (
          <Card style={{ padding:"14px 16px 8px" }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>🗓️ CC Bill Due Dates</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Set monthly due dates — get reminders 5 days before.</div>
            {accounts.creditCards.map(card => (
              <div key={card} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontWeight:700, fontSize:13 }}>💳 {card}</div>
                <input
                  type="date"
                  value={ccDueDates[card] || ""}
                  onChange={e => setCcDueDates(p => ({ ...p, [card]: e.target.value }))}
                  style={{
                    border:`2px solid ${ccDueDates[card] ? C.purple : C.border}`, borderRadius:10,
                    padding:"6px 10px", fontSize:12, fontFamily:"inherit", color:C.text,
                    outline:"none", background:"#fff", cursor:"pointer",
                  }}
                />
              </div>
            ))}
          </Card>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => { setNewItem(""); setShowAddModal(true); }} style={{
            border:"none", borderRadius:16, padding:"13px 22px",
            background:`linear-gradient(135deg,${C.green},${C.greenDk})`,
            color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer",
            display:"flex", alignItems:"center", gap:8,
            boxShadow:"0 4px 18px rgba(0,208,156,0.4)"
          }}>
            <span style={{ fontSize:20, lineHeight:1 }}>+</span> Add {typeLabel}
          </button>
        </div>

        {showAddModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
            onClick={() => setShowAddModal(false)}>
            <div style={{ background:C.card, borderRadius:"22px 22px 0 0", padding:"22px 20px 36px", width:"100%", maxWidth:430 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width:36, height:4, background:C.border, borderRadius:2, margin:"0 auto 18px" }} />
              <div style={{ fontWeight:900, fontSize:16, marginBottom:16 }}>Add {typeLabel}</div>
              <Input autoFocus placeholder={placeholder} value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addItem()} />
              <div style={{ display:"flex", gap:10, marginTop:16 }}>
                <button onClick={() => setShowAddModal(false)} style={{ flex:1, border:`2px solid ${C.border}`, borderRadius:14, padding:"13px", fontWeight:700, cursor:"pointer", background:"#fff", fontSize:14, color:C.text }}>Cancel</button>
                <button onClick={addItem} style={{ flex:1, border:"none", borderRadius:14, padding:"13px", background:`linear-gradient(135deg,${C.green},${C.greenDk})`, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {removeConfirm && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
            <div style={{ background:C.card, borderRadius:24, padding:"28px 22px", width:"100%", maxWidth:340, textAlign:"center" }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:C.redLt, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 16px" }}>⚠️</div>
              <div style={{ fontWeight:900, fontSize:18, marginBottom:8 }}>Remove Account?</div>
              <div style={{ background:C.bg, borderRadius:12, padding:"10px 16px", margin:"0 auto 12px", display:"inline-flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>{removeConfirm.tab==="bank"?"🏦":removeConfirm.tab==="card"?"💳":<WalletIco size={18} color="#FFB800"/>}</span>
                <span style={{ fontWeight:800, fontSize:14 }}>{removeConfirm.item}</span>
              </div>
              <div style={{ color:C.muted, fontSize:13, lineHeight:1.6, marginBottom:24 }}>
                This will only remove the account from your list.<br/>
                <span style={{ color:C.text, fontWeight:600 }}>Your existing transactions won't be affected.</span>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setRemoveConfirm(null)} style={{ flex:1, border:`2px solid ${C.border}`, borderRadius:14, padding:"14px", fontWeight:700, cursor:"pointer", background:"#fff", fontSize:14 }}>Cancel</button>
                <button onClick={doRemove} style={{ flex:1, border:"none", borderRadius:14, padding:"14px", background:`linear-gradient(135deg,${C.red},#E04545)`, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>Yes, Remove</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── TxnRow Component ─────────────────────────────────────────
  const TxnRow = ({ t, detailed = false, onDelete, onEdit }) => {
    const isLoad     = t.type === "wallet_load";
    const isTransfer = t.type === "transfer";
    const isCCExp    = t.type === "expense" && t.sourceType === "Credit Card";
    const isPaid     = isCCExp && ccPaid[t.id];
    const iconBg     = isLoad || isTransfer ? C.yellowLt : t.type === "income" ? C.greenLt : C.redLt;
    const amtColor   = isLoad || isTransfer ? C.yellow   : t.type === "income" ? C.green   : C.red;
    const amtPrefix  = isLoad ? "+" : isTransfer ? "↕" : t.type === "income" ? "+" : "−";
    const icon = isLoad ? <WalletIco size={20} color="#FFB800"/> : isTransfer ? "↕️" : (CAT_ICONS[t.category] || "💰");

    return (
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ width:42, height:42, borderRadius:12, flexShrink:0, background:iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
          {icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:C.text }}>
            {isLoad ? `Loaded → ${t.accountName}` : t.category}
          </div>
          {t.notes && <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{t.notes}</div>}
          {isLoad && <div style={{ fontSize:11, color:C.yellow, fontWeight:600, marginTop:1, display:"flex", alignItems:"center", gap:4 }}><WalletIco size={13} color="#FFB800"/> Wallet</div>}
          {detailed && !isLoad && !isTransfer && t.type === "expense" && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:5 }}>
              {t.paymentChannel !== "—" && (
                <span style={{ background:PC_COLORS[t.paymentChannel]+"18", color:PC_COLORS[t.paymentChannel], borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                  {PC_ICONS[t.paymentChannel]} {t.paymentChannel}
                </span>
              )}
              {t.upiApp && t.upiApp !== "—" && (
                <span style={{ background:C.blueLt, color:C.blue, borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:700 }}>📱 {t.upiApp}</span>
              )}
              {t.accountName !== "—" && (
                <span style={{ background:C.purpleLt, color:C.purple, borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                  {ST_ICONS[t.sourceType]||"🏦"} {t.accountName}
                </span>
              )}
              {isCCExp && (
                <span
                  onClick={() => setCcPaid(p => ({ ...p, [t.id]: !p[t.id] }))}
                  style={{
                    background: isPaid ? C.greenLt : C.redLt,
                    color: isPaid ? C.green : C.red,
                    borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:700, cursor:"pointer",
                    border: `1px solid ${isPaid ? C.green : C.red}33`
                  }}>
                  {isPaid ? "✅ Bill Paid" : "⏳ Bill Unpaid"}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:amtColor }}>
            {amtPrefix}{full(t.amount)}
          </div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{isoToLabel(t.date)}</div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
            {onEdit && (
              <button onClick={()=>onEdit(t)} style={{ border:"none", background:C.blueLt, color:C.blue, borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Edit</button>
            )}
            <button onClick={()=>onDelete(t.id)} style={{ border:"none", background:C.redLt, color:C.red, borderRadius:7, padding:"3px 9px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Delete</button>
          </div>
        </div>
      </div>
    );
  };

  const Empty = ({ msg, onAdd }) => (
    <div style={{ textAlign:"center", padding:"36px 0" }}>
      <div style={{ fontSize:48, marginBottom:10 }}>📭</div>
      <div style={{ color:C.muted, fontSize:13, fontWeight:500, marginBottom:16 }}>{msg}</div>
      {onAdd && <button onClick={onAdd} style={{ border:"none", background:C.green, color:"#fff", borderRadius:22, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer", boxShadow:"0 4px 14px rgba(0,208,156,0.35)" }}>+ Add Transaction</button>}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'DM Sans','Nunito',sans-serif", background:C.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", paddingBottom:82, position:"relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background:C.dark, padding:"18px 20px", position:"sticky", top:0, zIndex:50, textAlign:"center" }}>
        <div style={{ color:"#fff", fontSize:20, fontWeight:900, letterSpacing:-0.5 }}>Minhaj's Expense Tracker</div>
      </div>

      {/* Content */}
      <div style={{ padding:"12px 12px 0" }}>
        {tab === "home"     && HomeView()}
        {tab === "add"      && AddView()}
        {tab === "history"  && HistoryView()}
        {tab === "reports"  && ReportsView()}
        {tab === "rewards"  && RewardsView()}
        {tab === "settings" && SettingsView()}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430, background:C.card,
        display:"flex", justifyContent:"space-around",
        padding:"10px 0 16px", borderTop:`1px solid ${C.border}`, zIndex:50
      }}>
        {NAV.map(n => (
          <button key={n.id} onClick={()=>{
            setTab(n.id);
            if (n.id !== "add") { setEditingId(null); setForm(emptyForm()); setErrors({}); }
          }} style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:3,
            border:"none", background:"none", cursor:"pointer", padding:"0 8px", minWidth:50
          }}>
            <div style={{ color: tab===n.id ? C.green : C.muted, transition:"color 0.2s" }}>{n.icon}</div>
            <span style={{ fontSize:10, fontWeight:700, color:tab===n.id?C.green:C.muted, transition:"color 0.2s" }}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* Delete Confirm */}
      {delConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:C.card, borderRadius:22, padding:26, width:"100%", maxWidth:320, textAlign:"center" }}>
            <div style={{ fontSize:42, marginBottom:10 }}>🗑️</div>
            <div style={{ fontWeight:900, fontSize:17, marginBottom:8 }}>Delete Transaction?</div>
            <div style={{ color:C.muted, fontSize:13, marginBottom:22 }}>This cannot be undone.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setDelConfirm(null)} style={{ flex:1, border:`2px solid ${C.border}`, borderRadius:14, padding:"13px", fontWeight:700, cursor:"pointer", background:"#fff", fontSize:14 }}>Cancel</button>
              <button onClick={()=>{ setTxns(p=>p.filter(t=>t.id!==delConfirm)); setDelConfirm(null); }} style={{ flex:1, border:"none", borderRadius:14, padding:"13px", fontWeight:800, cursor:"pointer", background:C.red, color:"#fff", fontSize:14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletIco({ size = 20, color = "#FFB800" }) {
  const lighten = color === "#FFB800" ? "#FFD15C" : color === "#00D09C" ? "#5EECD4" : color === "#4A90E2" ? "#84BAFF" : "#B0A3FF";
  const darken  = color === "#FFB800" ? "#CC8800" : color === "#00D09C" ? "#00A07A" : color === "#4A90E2" ? "#2563BA" : "#5A44CC";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="5" width="38" height="24" rx="5" fill={lighten} transform="rotate(-20 26 5)"/>
      <rect x="33" y="4" width="38" height="24" rx="5" fill={darken} transform="rotate(-8 33 4)"/>
      <rect x="6" y="30" width="88" height="64" rx="12" fill={color}/>
      <rect x="68" y="53" width="26" height="18" rx="7" fill={darken} stroke="white" strokeWidth="3"/>
      <circle cx="81" cy="62" r="5" fill="white"/>
    </svg>
  );
}
function HomeIco()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>; }
function AddIco()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ListIco()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2"/><path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ChartIco() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 17l5-5 4 4 5-6 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function StarIco()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>; }
function GearIco()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>; }
