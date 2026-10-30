import {
  groupForBatchReview,
  isGenericEvidence,
  type ProposalRecord,
  type ReviewTier,
} from "./matching";

export interface ReviewProposal extends ProposalRecord {
  measureSlug: string;
  textSlug: string;
}

export interface ReviewStats {
  measures: number;
  pairs: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const KIND_LABEL: Record<string, string> = {
  SAME_OBJECT: "Même objet",
  BROADER_TEXT: "Texte plus large",
  NO_VOTE_IDENTIFIED: "Aucun rapprochement identifié",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "haute",
  medium: "moyenne",
  low: "faible",
};

const TABS: { tier: ReviewTier; label: string }[] = [
  { tier: "LOT_PRET", label: "Prêts à relire" },
  { tier: "A_EXAMINER", label: "À examiner" },
  { tier: "REJETE", label: "Rejetés par les contrôles" },
];

const ICON_SAME =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
const ICON_BROADER =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></svg>';

const rowKey = (r: { measureId: string; textId: string }) => `${r.measureId}|${r.textId}`;

function renderRow(r: ReviewProposal): string {
  const proposed = r.q.kind === "NO_VOTE_IDENTIFIED" ? null : r.q.kind;
  const badge = proposed
    ? `<span class="badge ${proposed === "SAME_OBJECT" ? "badge-solid" : "badge-outline"}">${proposed === "SAME_OBJECT" ? ICON_SAME : ICON_BROADER}Proposé : ${KIND_LABEL[proposed]}</span><span class="muted">Confiance : ${esc(CONFIDENCE_LABEL[r.q.confidence] ?? r.q.confidence)}</span>`
    : `<span class="muted">${KIND_LABEL.NO_VOTE_IDENTIFIED}</span>`;
  const titleOnly =
    proposed && r.tier !== "REJETE" && isGenericEvidence(r.q, r.textTitle)
      ? `<p class="warn" role="note">Citation = titre du dossier : à lire avec attention</p>`
      : "";
  const quotes = proposed
    ? `<div class="quotes"><figure class="quote q-measure"><figcaption>Dans la mesure</figcaption><blockquote>« ${esc(r.q.measureQuote)} »</blockquote></figure><figure class="quote"><figcaption>Dans le texte</figcaption><blockquote>« ${esc(r.q.textQuote)} »</blockquote></figure></div>`
    : "";
  const name = esc(r.measureText);
  return `<li class="row" data-key="${esc(rowKey(r))}" data-m="${esc(r.measureId)}" data-t="${esc(r.textId)}" data-kind="${esc(r.q.kind)}" data-tier="${r.tier}">
<label class="chkbox"><input type="checkbox" class="chk pick" aria-label="Cocher : ${name}"></label>
<div class="body"><p class="measure">${name}</p><p class="meta">${badge}</p>${titleOnly}${quotes}
<details><summary>Justification du modèle</summary><p>${esc(r.q.rationale)}</p></details>
<div class="choose" role="group" aria-label="Décision pour ${name}"><button type="button" class="btn" data-decision="SAME_OBJECT">Même objet</button><button type="button" class="btn" data-decision="BROADER_TEXT">Texte plus large</button><button type="button" class="btn" data-decision="REJECT">Rejeter</button></div>
<div class="decided" hidden><p class="decided-label"></p><button type="button" class="btn" data-undo>Modifier la décision</button></div></div></li>`;
}

function renderPanel(
  tier: ReviewTier,
  label: string,
  proposals: readonly ReviewProposal[],
  selected: boolean
): string {
  const ofTier = proposals.filter((p) => p.tier === tier);
  const groups =
    tier === "REJETE"
      ? groupRejected(ofTier)
      : groupForBatchReview(ofTier.map((p) => ({ ...p }))).map((g) => ({
          ...g,
          rows: g.rows as ReviewProposal[],
        }));
  const body = groups.length
    ? groups
        .map(
          (g, i) => `<section class="card group" aria-labelledby="g-${tier}-${i}">
<div class="group-head"><label class="chkbox"><input type="checkbox" class="chk all" aria-label="Cocher les ${g.rows.length} ligne(s) du dossier"></label>
<div class="grow"><h2 id="g-${tier}-${i}">${esc(g.textTitle)}</h2><p class="muted">${g.rows.length} mesure(s) proposée(s)</p></div>
<a class="link" href="/parlement/dossiers/${esc(g.rows[0]!.textSlug)}">Voir le dossier</a></div>
<ul>${g.rows.map(renderRow).join("")}</ul></section>`
        )
        .join("")
    : `<div class="card empty"><p>Aucune proposition à relire.</p><p class="muted">Cet onglet est vide pour cette analyse.</p></div>`;
  return `<div role="tabpanel" id="panel-${tier}" aria-label="${esc(label)}" data-tier="${tier}" ${selected ? "" : "hidden"}>${body}</div>`;
}

function groupRejected(rows: readonly ReviewProposal[]) {
  const groups = new Map<string, { textId: string; textTitle: string; rows: ReviewProposal[] }>();
  for (const r of rows) {
    const g = groups.get(r.textId) ?? { textId: r.textId, textTitle: r.textTitle, rows: [] };
    g.rows.push(r);
    groups.set(r.textId, g);
  }
  return [...groups.values()].toSorted(
    (l, r) => r.rows.length - l.rows.length || l.textId.localeCompare(r.textId)
  );
}

const STYLE = `body{margin:0;background:#f5f5f5;color:#1a1a1a;font:16px 'Atkinson Hyperlegible',system-ui,sans-serif}
.bar{height:3px;background:linear-gradient(90deg,#ed2939,#002654)}main{max-width:1100px;margin:0 auto;padding:32px 16px 64px;display:flex;flex-direction:column;gap:24px}
h1{margin:0;font:800 32px Outfit,system-ui,sans-serif;color:#002654}h2{margin:0;font:800 20px Outfit,system-ui,sans-serif;color:#002654}
.muted{color:#4a4a4a;font-size:14px;margin:0}.card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:16px}
a{color:#002654}.link{display:inline-flex;align-items:center;min-height:44px;font-weight:700}
a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid #002654;outline-offset:2px}
.note{display:flex;gap:12px;background:#fff;border:2px solid #002654;border-radius:12px;padding:14px 16px;margin:0}
dl{margin:0;display:flex;flex-wrap:wrap;gap:12px}dl div{background:#fff;border:1px solid #ddd;border-radius:16px;padding:12px 16px;min-width:140px}dt{color:#4a4a4a;font-size:14px}dd{margin:0;font:800 28px Outfit,system-ui,sans-serif;color:#002654}
[role=tablist]{display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid #ddd}
[role=tab]{min-height:44px;padding:0 16px;border:2px solid transparent;border-bottom:0;border-radius:10px 10px 0 0;background:transparent;color:#002654;font:700 15px 'Atkinson Hyperlegible',system-ui,sans-serif}
[role=tab][aria-selected=true]{background:#fff;border-color:#002654;margin-bottom:-1px}
.btn,.btn-primary{min-height:44px;padding:0 16px;border:2px solid #002654;border-radius:10px;font:700 15px 'Atkinson Hyperlegible',system-ui,sans-serif;cursor:pointer}
.btn{background:#fff;color:#002654}.btn-primary{background:#002654;color:#fff}
.btn:disabled,.btn-primary:disabled{border-color:#b5b5b5;color:#6b6b6b;background:#f0f0f0;cursor:not-allowed}
.bulk,.foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.grow{flex:1 1 300px}
.group{display:flex;flex-direction:column;gap:12px;margin:0 0 16px}.group-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
ul{margin:0;padding:0;list-style:none}.row{display:flex;gap:12px;border-top:1px solid #ddd;padding-top:16px;margin-top:16px}.row>.chkbox{align-self:flex-start}.row[data-decided]{background:#fafafa}
.chkbox{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px}.chk{width:24px;height:24px;margin:0;accent-color:#002654}
.body{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px}.measure{margin:0;font-weight:700;font-size:18px}
.meta{margin:0;display:flex;flex-wrap:wrap;gap:8px 16px;font-size:14px;font-weight:700}
.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px;border:2px solid #002654}.badge-solid{background:#002654;color:#fff}.badge-outline{background:#fff;color:#002654}
.warn{margin:0;background:#fff;border:2px solid #002654;border-radius:10px;padding:8px 12px;font-weight:700;color:#002654}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.quote{margin:0;border:1px solid #ddd;border-radius:12px;padding:12px;background:#fff}.q-measure{background:#fafafa}
figcaption{font-size:13px;font-weight:700;color:#4a4a4a}blockquote{margin:6px 0 0;font-size:15px}
summary{min-height:44px;display:flex;align-items:center;font-weight:700;color:#4a4a4a;cursor:pointer}details p{margin:0 0 8px}
.choose{display:flex;flex-wrap:wrap;gap:8px}.decided{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.decided[hidden],.choose[hidden]{display:none}.decided-label{margin:0;font-weight:700;color:#002654}
dialog{border:2px solid #002654;border-radius:12px;padding:16px;max-width:560px}dialog h2{margin-bottom:8px}dialog .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}`;

const SCRIPT = `const L={SAME_OBJECT:'Même objet',BROADER_TEXT:'Texte plus large',REJECT:'Rejeté'};
const rows=[...document.querySelectorAll('.row')];const picks=rows.map(r=>r.querySelector('.pick'));
const decisions=new Map();const total=Number(document.body.dataset.total);
const checked=()=>rows.filter(r=>r.querySelector('.pick').checked);
const bulk=[...document.querySelectorAll('[data-bulk]')];
function refresh(){const c=checked().length;document.getElementById('picked').textContent=c+(c>1?' lignes cochées':' ligne cochée');bulk.forEach(b=>b.disabled=c===0);
const onProp=[...decisions.keys()].filter(k=>document.querySelector('[data-key="'+k+'"]').dataset.tier!=='REJETE').length;const onRej=decisions.size-onProp;
document.getElementById('decisions').textContent=onProp+' décision'+(onProp>1?'s':'')+' prise'+(onProp>1?'s':'')+' sur '+total+(onRej?' (+'+onRej+' sur les rejetés)':'');
document.getElementById('export').disabled=decisions.size===0;
document.querySelectorAll('.all').forEach(a=>{const rs=[...a.closest('section').querySelectorAll('.pick')];a.checked=rs.length>0&&rs.every(x=>x.checked)})}
function decide(row,d){const k=row.dataset.key;decisions.set(k,d);row.setAttribute('data-decided','');row.querySelector('.choose').hidden=true;const el=row.querySelector('.decided');el.hidden=false;el.querySelector('.decided-label').textContent='Décidé : '+L[d]}
function undo(row){decisions.delete(row.dataset.key);row.removeAttribute('data-decided');row.querySelector('.choose').hidden=false;row.querySelector('.decided').hidden=true}
document.querySelectorAll('.all').forEach(a=>a.addEventListener('change',()=>{a.closest('section').querySelectorAll('.pick').forEach(p=>p.checked=a.checked);refresh()}));
picks.forEach(p=>p.addEventListener('change',refresh));
rows.forEach(r=>{r.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>{decide(r,b.dataset.decision);refresh();const u=r.querySelector('[data-undo]');if(u)u.focus()}));r.querySelector('[data-undo]').addEventListener('click',()=>{undo(r);refresh();r.querySelector('[data-decision]').focus()})});
const dlg=document.getElementById('confirm');let pending=null;
bulk.forEach(b=>b.addEventListener('click',()=>{pending=b.dataset.bulk;const n=checked().length;document.getElementById('confirm-title').textContent='Marquer '+n+(n>1?' rapprochements':' rapprochement')+' comme « '+L[pending]+' » ?';document.getElementById('confirm-ok').textContent='Confirmer pour '+(n>1?'les '+n+' lignes':'la ligne');dlg.showModal()}));
document.getElementById('confirm-cancel').addEventListener('click',()=>dlg.close());
document.getElementById('confirm-ok').addEventListener('click',()=>{checked().forEach(r=>{decide(r,pending);r.querySelector('.pick').checked=false});dlg.close();refresh()});
const tabs=[...document.querySelectorAll('[role=tab]')];
tabs.forEach(t=>t.addEventListener('click',()=>{tabs.forEach(x=>x.setAttribute('aria-selected',String(x===t)));document.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==t.getAttribute('aria-controls'))}));
document.getElementById('export').addEventListener('click',()=>{const d=rows.filter(r=>decisions.has(r.dataset.key)).map(r=>({measureId:r.dataset.m,textId:r.dataset.t,proposedKind:r.dataset.kind,tier:r.dataset.tier,decision:decisions.get(r.dataset.key)}));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='decisions.json';a.click()});
refresh();`;

/**
 * Standalone review page (no network, no write): nothing is ticked or decided up front, the
 * reviewer rules row by row or by batch, and exports a decisions file.
 */
export function renderReviewPage(proposals: readonly ReviewProposal[], stats: ReviewStats): string {
  const count = (tier: ReviewTier) => proposals.filter((p) => p.tier === tier).length;
  const proposed = count("LOT_PRET") + count("A_EXAMINER");
  const counters = [
    ["Mesures analysées", stats.measures],
    ["Paires qualifiées", stats.pairs],
    ["Propositions", proposed],
    ["Prêtes à relire", count("LOT_PRET")],
    ["À examiner", count("A_EXAMINER")],
  ]
    .map(([label, n]) => `<div><dt>${label}</dt><dd>${n}</dd></div>`)
    .join("");
  const tabs = TABS.map(
    (t, i) =>
      `<button type="button" role="tab" id="tab-${t.tier}" aria-controls="panel-${t.tier}" aria-selected="${i === 0}">${t.label} (${count(t.tier)})</button>`
  ).join("");
  const panels = TABS.map((t, i) => renderPanel(t.tier, t.label, proposals, i === 0)).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>File de validation des rapprochements</title>
<style>${STYLE}</style></head><body data-total="${proposed}"><div class="bar"></div><main>
<header style="display:flex;flex-direction:column;gap:12px"><p class="muted">Essai hors ligne · Mesures présidentielle 2027</p><h1>File de validation des rapprochements</h1>
<p class="note" role="note"><span><b>Propositions générées par un modèle, à relire.</b> Rien n'est publié sans votre décision. L'export est un fichier : aucun lien n'est écrit en base.</span></p>
<dl>${counters}</dl></header>
<div role="tablist" aria-label="Niveaux de la file">${tabs}</div>
<div class="card bulk"><p class="grow" id="picked" style="margin:0;font-weight:700"></p>
<button type="button" class="btn" data-bulk="SAME_OBJECT" disabled>Même objet pour les lignes cochées</button><button type="button" class="btn" data-bulk="BROADER_TEXT" disabled>Texte plus large pour les lignes cochées</button><button type="button" class="btn" data-bulk="REJECT" disabled>Rejeter les lignes cochées</button></div>
${panels}
<div class="card foot"><p class="grow" id="decisions" aria-live="polite" style="margin:0;font-weight:700"></p><button type="button" class="btn-primary" id="export" disabled>Exporter les décisions</button></div>
<dialog id="confirm" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-desc"><h2 id="confirm-title"></h2><p id="confirm-desc" style="margin:0">Chaque ligne cochée recevra cette décision. Vous pourrez la modifier ligne par ligne avant l'export.</p><div class="actions"><button type="button" class="btn-primary" id="confirm-ok"></button><button type="button" class="btn" id="confirm-cancel">Annuler</button></div></dialog>
</main><script>${SCRIPT}</script></body></html>`;
}
