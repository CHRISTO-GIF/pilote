import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { toast, useAction } from "../components/ui.jsx";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, run] = useAction();

  async function submit(e) {
    e.preventDefault();
    await run("auth", async () => {
      const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { data, error } = await fn.call(supabase.auth, { email, password });
      if (error) throw error;
      if (mode === "signup" && !data.session) toast("Compte créé : confirmez votre adresse e-mail puis connectez-vous.");
    });
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="brand-mark">P</span>
          <span>Pilote</span>
        </div>
        <p className="muted">Vos pages publient toutes seules, chaque jour et chaque semaine.</p>
        <label>
          E-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
        </button>
      </form>
    </div>
  );
}
