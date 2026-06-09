"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // global-error remplace le root layout : globals.css n'est pas garanti chargé,
  // donc on s'appuie sur des styles inline plutôt que sur le design system.
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#0f172a",
          backgroundColor: "#f8fafc",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.75rem" }}>
          Une erreur critique est survenue
        </h1>
        <p style={{ maxWidth: "28rem", color: "#475569", marginBottom: "2rem" }}>
          Le site a rencontré une erreur inattendue. Vous pouvez réessayer de recharger la page.
        </p>
        <button
          onClick={reset}
          style={{
            cursor: "pointer",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0.625rem 1.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "#ffffff",
            backgroundColor: "#0f172a",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
