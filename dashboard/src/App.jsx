import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Toaster } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Accounts from "./pages/Accounts.jsx";
import Library from "./pages/Library.jsx";
import Schedules from "./pages/Schedules.jsx";
import Posts from "./pages/Posts.jsx";

const TABS = [
  { id: "overview", label: "Accueil", icon: "◎", el: Overview },
  { id: "posts", label: "Publications", icon: "▤", el: Posts },
  { id: "schedules", label: "Planning", icon: "◷", el: Schedules },
  { id: "library", label: "Bibliothèque", icon: "▦", el: Library },
  { id: "accounts", label: "Comptes", icon: "⊕", el: Accounts },
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState(() => location.hash.slice(1) || "overview");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    location.hash = tab;
  }, [tab]);

  if (session === undefined) return <div className="boot">Pilote</div>;
  if (!session) return (<><Login /><Toaster /></>);

  const Current = (TABS.find((t) => t.id === tab) ?? TABS[0]).el;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>Pilote</span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span className="ico">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <small>{session.user.email}</small>
          <button className="link" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </aside>
      <main className="main">
        <Current user={session.user} go={setTab} />
      </main>
      <Toaster />
    </div>
  );
}
