"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHANGELOG_TYPE_LABELS } from "@/config/labels";
import { formatChangelogDay } from "@/lib/changelog/format";

type EntryType = keyof typeof CHANGELOG_TYPE_LABELS;

interface Entry {
  id: string;
  type: EntryType;
  date: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  status: "DRAFT" | "PUBLISHED";
}

interface Form {
  type: EntryType;
  date: string;
  title: string;
  body: string;
  sourceUrl: string;
}

const TYPES = Object.keys(CHANGELOG_TYPE_LABELS) as EntryType[];

function emptyForm(): Form {
  return {
    type: "AMELIORATION",
    date: new Date().toISOString().slice(0, 10),
    title: "",
    body: "",
    sourceUrl: "",
  };
}

type View = "ALL" | "DRAFT" | "PUBLISHED";

export default function ChangelogAdminPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/changelog");
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editing = entries.find((entry) => entry.id === editingId) ?? null;
  const shown = entries.filter((entry) => view === "ALL" || entry.status === view);
  const draftCount = entries.filter((entry) => entry.status === "DRAFT").length;

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setForm({
      type: entry.type,
      date: entry.date,
      title: entry.title,
      body: entry.body,
      sourceUrl: entry.sourceUrl ?? "",
    });
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function save(status?: "DRAFT" | "PUBLISHED") {
    setSaving(true);
    const payload = {
      type: form.type,
      date: form.date,
      title: form.title,
      body: form.body,
      sourceUrl: form.sourceUrl.trim() === "" ? null : form.sourceUrl.trim(),
    };
    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/admin/changelog/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, ...(status && { status }) }),
        });
      } else {
        res = await fetch("/api/admin/changelog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Enregistrement impossible, vérifiez les champs");
        return;
      }
      const saved: Entry = await res.json();
      // A new entry is created as a draft: publishing is a second, explicit call.
      if (!editingId && status === "PUBLISHED") {
        const publish = await fetch(`/api/admin/changelog/${saved.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
        if (!publish.ok) {
          const data = await publish.json().catch(() => null);
          toast.error(data?.error ?? "Publication impossible");
          setEditingId(saved.id);
          await load();
          return;
        }
      }
      toast.success(status === "PUBLISHED" ? "Entrée publiée" : "Brouillon enregistré");
      await load();
      startCreate();
    } finally {
      setSaving(false);
    }
  }

  async function unpublish(entry: Entry) {
    const res = await fetch(`/api/admin/changelog/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DRAFT" }),
    });
    if (res.ok) {
      toast.success("Entrée repassée en brouillon");
      await load();
    } else {
      toast.error("Action impossible");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/changelog/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    if (res.ok) {
      if (editingId === deleteTarget.id) startCreate();
      await load();
    } else {
      toast.error("Suppression impossible");
    }
  }

  const canSubmit = form.title.trim() !== "" && form.body.trim() !== "" && form.date !== "";
  const canPublish = canSubmit && form.sourceUrl.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Journal des évolutions</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Les entrées publiées apparaissent sur la page publique /changelog et dans son flux RSS.
          </p>
        </div>
        <Button onClick={startCreate} className="min-h-11">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle entrée
        </Button>
      </div>

      <div role="group" aria-label="Filtrer par publication" className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", "Toutes", entries.length],
            ["DRAFT", "Brouillons", draftCount],
            ["PUBLISHED", "Publiées", entries.length - draftCount],
          ] as const
        ).map(([value, label, count]) => (
          <Button
            key={value}
            type="button"
            variant={view === value ? "default" : "outline"}
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className="min-h-11"
          >
            {label} <span className="tabular-nums opacity-85">{count}</span>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Liste des entrées" className="min-w-0 flex-[999_1_520px]">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
              ) : shown.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Aucune entrée dans cette vue pour le moment.
                </p>
              ) : (
                <ul className="divide-y">
                  {shown.map((entry) => (
                    <li
                      key={entry.id}
                      className={`flex flex-wrap items-start gap-3 p-4 ${
                        entry.id === editingId ? "bg-accent" : ""
                      }`}
                    >
                      <time
                        dateTime={entry.date}
                        className="basis-32 shrink-0 text-sm tabular-nums text-muted-foreground-strong"
                      >
                        {formatChangelogDay(entry.date)}
                      </time>
                      <div className="min-w-0 flex-1 basis-56 space-y-1">
                        <p className="font-bold">{entry.title}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-strong">
                          <span className="rounded-full border px-2.5 py-0.5 font-bold">
                            {CHANGELOG_TYPE_LABELS[entry.type]}
                          </span>
                          <span className="rounded-full border px-2.5 py-0.5 font-bold">
                            {entry.status === "PUBLISHED" ? "Publiée" : "Brouillon"}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => startEdit(entry)}
                          aria-label={`Modifier l'entrée ${entry.title}`}
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => setDeleteTarget(entry)}
                          aria-label={`Supprimer l'entrée ${entry.title}`}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <form
          aria-labelledby="changelog-form-title"
          onSubmit={(event) => event.preventDefault()}
          className="min-w-0 max-w-md flex-[1_1_360px] space-y-4 rounded-2xl border bg-card p-5"
        >
          <div>
            <p className="text-xs font-bold text-muted-foreground-strong">
              {editing ? "Modifier l'entrée" : "Nouvelle entrée"}
            </p>
            <h2 id="changelog-form-title" className="text-lg font-bold">
              {editing ? editing.title : "Brouillon"}
            </h2>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-type">Type</Label>
            <select
              id="c-type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as EntryType })}
              className="border-input h-11 w-full rounded-md border bg-card px-3 text-sm"
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {CHANGELOG_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-date">Date</Label>
            <Input
              id="c-date"
              type="date"
              className="h-11"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-titre">Titre</Label>
            <Input
              id="c-titre"
              className="h-11"
              maxLength={140}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-texte">Texte</Label>
            <Textarea
              id="c-texte"
              rows={4}
              maxLength={600}
              aria-describedby="c-texte-aide"
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
            />
            <p id="c-texte-aide" className="text-xs text-muted-foreground-strong">
              Une ou deux phrases factuelles. Pas de chiffre qui deviendrait faux demain, pas de
              formule promotionnelle.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-source">Lien vers la source</Label>
            <Input
              id="c-source"
              type="url"
              className="h-11"
              aria-describedby="c-source-aide"
              value={form.sourceUrl}
              onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
            />
            <p id="c-source-aide" className="text-xs text-muted-foreground-strong">
              Obligatoire pour publier : la PR ou le commit, ou la source officielle pour une mise à
              jour de données.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={!canSubmit || saving}
              onClick={() => save(editing?.status === "PUBLISHED" ? undefined : "DRAFT")}
            >
              {editing?.status === "PUBLISHED" ? "Enregistrer" : "Enregistrer le brouillon"}
            </Button>
            {editing?.status === "PUBLISHED" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => unpublish(editing)}
              >
                Repasser en brouillon
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11"
                disabled={!canPublish || saving}
                onClick={() => save("PUBLISHED")}
              >
                Publier
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground-strong">
            Publier met à jour la page /changelog et le flux RSS. Chaque modification est inscrite
            au journal d&apos;audit.
          </p>
        </form>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        title="Supprimer cette entrée ?"
        description={`L'entrée « ${deleteTarget?.title ?? ""} » sera supprimée définitivement.`}
        confirmLabel="Supprimer"
        variant="destructive"
      />
    </div>
  );
}
