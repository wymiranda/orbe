-- Not the english_decks / english_deck_entries tables of 0001 (catalogue decks, unused for now).
-- Flashcard decks uploaded by learners (Anki .apkg, read in the browser; only
-- the text of each note reaches the server). owner_id is the stable user ID
-- from the platform database (`DB`).
--
-- visibility: 'private' (only the owner sees the deck) or 'public' (every
-- learner of the English workspace sees it). Only the owner changes or deletes it.
-- Card ids are "<deck id>:<position>", so learner progress kept on the device
-- (by card id) stays attached to the right card.

CREATE TABLE english_anki_decks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX english_anki_decks_owner ON english_anki_decks (owner_id);
CREATE INDEX english_anki_decks_visibility ON english_anki_decks (visibility);

CREATE TABLE english_anki_deck_cards (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL REFERENCES english_anki_decks (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL
);

CREATE INDEX english_anki_deck_cards_deck ON english_anki_deck_cards (deck_id, position);
