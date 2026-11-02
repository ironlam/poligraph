// Portrait au style Poligraph : photo libre de Wikimedia Commons, recadrée, en bichromie bleu nuit et crème.
// Usage : node portrait.mjs "<Titre du fichier Commons>" <sortie.png> [x,y,largeur,hauteur]
// Le recadrage est en pixels de l'image source (carré conseillé). Écrit aussi <sortie>.credit.txt.
// Refuse tout fichier dont la licence n'est pas libre : une photo de la base n'a pas de licence enregistrée.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const [title, out, crop] = process.argv.slice(2);
if (!title || !out) {
  console.error('Usage : node portrait.mjs "<Titre Commons>" <sortie.png> [x,y,l,h]');
  process.exit(1);
}
const UA = { "User-Agent": "poligraph-kit/1.0 (contact@poligraph.fr)" };
const FREE = /^(CC0|Public domain|No restrictions|CC BY(-SA)? [\d.]+( igo)?)$/i;
const strip = (s = "") => s.replace(/<[^>]+>/g, "").trim();

const api = new URL("https://commons.wikimedia.org/w/api.php");
api.search = new URLSearchParams({
  action: "query",
  titles: `File:${title.replace(/^File:/, "")}`,
  prop: "imageinfo",
  iiprop: "url|extmetadata",
  format: "json",
});
const page = Object.values((await (await fetch(api, { headers: UA })).json()).query.pages)[0];
const info = page.imageinfo?.[0];
if (!info) throw new Error(`Fichier introuvable : ${title}`);
const m = info.extmetadata;
const licence = strip(m.LicenseShortName?.value);
if (!FREE.test(licence)) throw new Error(`Licence refusée : « ${licence} ». Pas de portrait.`);

const res = await fetch(info.url, { headers: UA });
if (!res.ok) throw new Error(`Téléchargement : ${res.status}`);
let img = sharp(Buffer.from(await res.arrayBuffer())).rotate();
if (crop) {
  const [left, top, width, height] = crop.split(",").map(Number);
  img = img.extract({ left, top, width, height });
}
const { data, info: px } = await img
  .resize(900, 900, { fit: "cover" })
  .greyscale()
  .normalise()
  .raw()
  .toBuffer({ resolveWithObject: true });
const navy = [8, 43, 77],
  cream = [247, 245, 239];
const rgb = Buffer.alloc(px.width * px.height * 3);
for (let i = 0; i < data.length; i++) {
  const l = data[i] / 255;
  for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(navy[c] + (cream[c] - navy[c]) * l);
}
await sharp(rgb, { raw: { width: px.width, height: px.height, channels: 3 } })
  .png()
  .toFile(out);

const artist = strip(m.Artist?.value);
await writeFile(
  `${out}.credit.txt`,
  `${artist} (${licence}), via Wikimedia Commons\n${info.descriptionurl}\n`
);
console.log(`${out}\n  ${artist} | ${licence}\n  ${info.descriptionurl}`);
