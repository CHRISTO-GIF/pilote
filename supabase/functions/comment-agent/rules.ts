// Règles de l'agent de commentaires (sans IA) : classer un commentaire et choisir la réponse.

export type PostInfo = { caption: string; tags: string[]; publishedAt: string | null };
export type Decision = { category: string; reply?: string; flag?: boolean };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function pick(list: string[], seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function fill(tpl: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return tpl.replaceAll("{p}", first ? ` ${first}` : "").replace(/\s+([!?:])/g, " $1");
}

// --- Quiz : options et réponse ---
const LETTER_MARKS: Record<string, string> = { "🅰": "A", "🅱": "B", "©": "C" };
export function parseQuiz(caption: string): Record<string, string> | null {
  if (!/QUIZ DU MERCREDI/i.test(caption)) return null;
  const opts: Record<string, string> = {};
  for (const line of caption.split("\n")) {
    const t = line.replace(/\uFE0F/g, "").trim();
    for (const [mark, letter] of Object.entries(LETTER_MARKS)) {
      if (t.startsWith(mark)) opts[letter] = t.slice(mark.length).trim();
    }
    const m = t.match(/^([ABC])\s*[).:-]\s*(.+)$/);
    if (m) opts[m[1]] = m[2];
  }
  return Object.keys(opts).length >= 2 ? opts : null;
}

function answerOf(msg: string, opts: Record<string, string>): string | null {
  const n = norm(msg);
  const m = n.match(/^(?:(?:la\s+)?(?:bonne\s+)?(?:reponse|rep)\s*(?:est|:)?\s*|c'?est\s+(?:la\s+)?|moi\s*:?\s*)?\(?([abc])\)?(?:\b|$)/);
  if (m) return m[1].toUpperCase();
  const hits = Object.entries(opts).filter(([, txt]) => {
    const o = norm(txt);
    return o.length > 0 && new RegExp(`(^|[^a-z0-9])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(n);
  });
  return hits.length === 1 ? hits[0][0] : null;
}

// --- Vocabulaire ---
const SENSIBLE = /(plainte|probleme|honte|arnaque|escroc|\bvol(e|ee|eur|eurs)?\b|mauvais|\bnul(le)?\b|frapp|battu|violence|harcel|injust|rembours|menace|police|insult|maltrait|accident|blesse|malade|deces|decede|disparu|\babus|corrupt|racket|chicotte|fouet|scandale|mensonge|menteur|\bpire\b|\bdecu|inadmissible|inacceptable|deplorable|negligen|retire mon enfant|http|www\.)/;
const INFO = /(inscri|frais|\bprix\b|combien|tarif|scolarite|montant|contact|numero|telephone|whatsapp|adresse|ou se trouve|localis|places? disponible|recrut|emploi|\bstage\b|horaire|transport|uniforme|cantine|test d'entree|concours d'entree|renseign|je voudrais|je veux|j'aimerais|s'il vous plait|\bsvp\b|\baide\b|annuler)/;
const MERCI = /(merci|bravo|felicit|super|top\b|excellent|magnifique|genial|formidable|beau|belle|bien\b|amen|dieu|beni|courage|continuez|bonne continuation|fier|proud|great|nice|good|well done|love|thank|chapeau|respect)/;
const FETES = /(joyeux noel|bonne annee|bonnes fetes|joyeuses fetes|happy new year|merry christmas)/;
const SEMAINE = /(bonne semaine|bon lundi|bonne journee)/;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s❤️]+$/u;

const R = {
  quizAvant: [
    "Merci pour ta participation{p} ! 🤞 La bonne réponse arrive vendredi.",
    "Réponse bien enregistrée{p} ! 😉 Rendez-vous vendredi pour la solution.",
    "Bien joué d'avoir tenté ta chance{p} ! 🧠 Résultat vendredi sur la Page.",
    "Merci{p} ! 🙌 Verdict vendredi : reste connecté(e) !",
  ],
  quizBon: [
    "Bravo{p}, c'est la bonne réponse ! 🎉",
    "Exact{p} ! 👏 Champion(ne) du quiz Holy Flame !",
    "Bonne réponse{p} ! 🌟 À mercredi pour le prochain quiz.",
  ],
  quizFaux: [
    "Presque{p} ! La bonne réponse était {L} : {T}. 😉 Rendez-vous mercredi pour le prochain quiz !",
    "Bien essayé{p} ! C'était {L} : {T}. On compte sur toi mercredi prochain 💪",
  ],
  merci: [
    "Merci beaucoup{p} pour votre message ! 💙",
    "Merci{p} ! Votre soutien compte énormément pour toute l'équipe Holy Flame 💙",
    "Un grand merci{p} ! 🙏 Assiduity · Work · Success",
    "Merci{p}, c'est très encourageant pour nos élèves et nos enseignants ! 💙",
  ],
  fetes: [
    "Merci{p} ! Joyeuses fêtes à vous et à toute votre famille ✨",
    "Merci beaucoup{p} ! Belle fin d'année à vous aussi ✨💙",
  ],
  semaine: [
    "Merci{p} ! Excellente semaine à vous aussi 💙",
    "Merci{p}, bonne semaine à toute votre famille ! ☀️",
  ],
  info: [
    "Bonjour{p} ! Merci pour votre intérêt pour Holy Flame 💙 Écrivez-nous en message privé, nous vous répondons rapidement avec toutes les informations.",
    "Bonjour{p} ! Pour tout renseignement, envoyez-nous un message privé : l'équipe vous répond au plus vite. 💙",
  ],
};

export function classify(message: string, author: string, post: PostInfo, seed: string, now = Date.now()): Decision {
  const n = norm(message);
  if (!n) return { category: "vide" };                                   // autocollant, photo seule : on ignore
  if (SENSIBLE.test(n) || message.length > 350) return { category: "sensible", flag: true };

  const opts = parseQuiz(post.caption);
  if (opts) {
    const letter = answerOf(message, opts);
    if (letter) {
      const key = post.tags.map((t) => t.match(/^reponse:([ABC])$/i)?.[1]?.toUpperCase()).find(Boolean);
      const published = post.publishedAt ? Date.parse(post.publishedAt) : now;
      const revealed = now > published + 46 * 3600_000;                   // vendredi, après la réponse officielle
      if (!key || !revealed) return { category: "quiz", reply: fill(pick(R.quizAvant, seed), author) };
      if (letter === key) return { category: "quiz", reply: fill(pick(R.quizBon, seed), author) };
      return {
        category: "quiz",
        reply: fill(pick(R.quizFaux, seed), author).replace("{L}", key).replace("{T}", opts[key] ?? ""),
      };
    }
  }
  if (INFO.test(n) || n.includes("?")) return { category: "info", reply: fill(pick(R.info, seed), author) };
  if (FETES.test(n)) return { category: "merci", reply: fill(pick(R.fetes, seed), author) };
  if (SEMAINE.test(n)) return { category: "merci", reply: fill(pick(R.semaine, seed), author) };
  if (MERCI.test(n) || EMOJI_ONLY.test(message.trim())) return { category: "merci", reply: fill(pick(R.merci, seed), author) };
  if (n.split(" ").length <= 5) return { category: "court", reply: fill("Merci pour votre message{p} ! 💙", author) };
  return { category: "a_relire", flag: true };
}
