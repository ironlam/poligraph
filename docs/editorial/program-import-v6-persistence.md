# Persistance de la preuve Program Import V6

## Contrat

`MeasureRevision.evidenceSnapshot` contient, lorsqu'il existe, un `EvidenceSnapshotV3` complet et
validé. La colonne PostgreSQL est un JSONB nullable pour préserver les révisions historiques, les
saisies manuelles et le pipeline V5.

La nullabilité de la colonne n'assouplit pas la frontière V6. Une création de révision déclarée avec
`importEngine: "V6"` est refusée avec `MISSING_VALID_EVIDENCE_SNAPSHOT` si le snapshot est absent ou
invalide. Un snapshot fourni par un autre chemin est également validé avant écriture et refusé s'il ne
respecte pas le schéma V3.

## Immutabilité

Le snapshot appartient à une révision précise. Les transitions l'écrivent uniquement pendant la
création de cette révision. Aucun chemin ne met à jour `evidenceSnapshot` sur une révision existante.

Une correction éditoriale crée une nouvelle `MeasureRevision` :

- la révision précédente conserve le snapshot qui justifiait son texte ;
- une nouvelle révision V6 doit fournir un nouveau snapshot V3 validé ou un snapshot explicitement
  régénéré et revalidé ;
- une révision manuelle ou V5 peut rester sans snapshot ;
- le snapshot précédent ne doit jamais être copié puis modifié silencieusement.

Cette association permet d'auditer la formulation historique même si le document distant, le parser,
les prompts ou les modèles changent ensuite.

## Lecture admin

L'admin désérialise le JSON avec `EvidenceSnapshotV3Schema`. Une version inconnue, une empreinte
incohérente, une partition anchor/contexte invalide ou une unité absente produit un état invalide. Dans
ce cas, le JSON n'est pas présenté comme preuve.

Pour un snapshot valide, l'écran montre dans cet ordre :

1. la formulation de la révision ;
2. l'attribution retenue ;
3. le document officiel et les pages ;
4. les commitment anchors exacts ;
5. les unités de contexte ;
6. les versions et hashes dans une section technique repliable.

Les révisions sans snapshot restent lisibles et sont identifiées comme historiques, manuelles ou V5.

## Déploiement

La migration ajoute uniquement une colonne JSONB nullable, sans défaut et sans backfill. Sa présence
dans le dépôt n'autorise ni `prisma migrate deploy`, ni écriture Supabase, ni activation de `--apply`,
ni création de DRAFT V6, ni publication, ni cutover.
