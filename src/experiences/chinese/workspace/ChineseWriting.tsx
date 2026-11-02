import { lazy, useEffect, useState } from "react";
import "../../../App.css";
import type { WritingPracticeItem } from "../../../modules/writing/WritingModule";
import PageHeader from "../../../core/PageHeader";

const WritingModule = lazy(() => import("../../../modules/writing/WritingModule"));

export function ChineseWriting() {
  const [items, setItems] = useState<WritingPracticeItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/chinese/vocabulary")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Não foi possível carregar os caracteres.");
        const vocabulary = (await response.json()) as {
          id: string;
          type: string;
          hanzi: string;
          pinyin: string;
          portuguese: string;
          hsk_level: string;
        }[];
        setItems(
          vocabulary
            .filter((item) => /^[\p{Script=Han}]+$/u.test(item.hanzi))
            .map((item) => ({ id: item.id, glyph: item.hanzi, label: item.portuguese, detail: item.pinyin, hskLevel: item.hsk_level })),
        );
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os caracteres.",
        ),
      );
  }, []);
  if (error)
    return (
      <main className="workspace-view">
        <section className="welcome writing-page">
          <PageHeader eyebrow="ESCRITA" title="Pratique traço por traço." />
          <p className="error">{error}</p>
        </section>
      </main>
    );
  return <WritingModule items={items} embedded />;
}
