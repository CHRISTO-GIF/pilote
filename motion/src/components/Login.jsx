import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Login({ onClose, toast }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast(error.message, "bad");
    toast("Connecté ✓");
    onClose();
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Connexion à Pilote</h2>
        <p className="muted">Utilisez le même compte que le tableau de bord Pilote.</p>
        <label className="field"><span>E-mail</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Mot de passe</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <div className="row">
          <button className="btn primary grow" disabled={busy}>{busy ? "…" : "Se connecter"}</button>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </div>
  );
}
