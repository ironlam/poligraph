/**
 * Result files of the past municipal ballots on data.gouv.fr. Shared by the importers and by the
 * Territoires pages, so the file a figure is read from and the file it links to cannot drift.
 */

/** 2020: one file per round and per size class (1,000 inhabitants and more, then fewer). */
export const MUNICIPALES_2020_FILES = {
  t1Large: "https://www.data.gouv.fr/fr/datasets/r/5129e7cf-2999-4eaf-8dd7-3bcda37bd0a3",
  t1Small: "https://www.data.gouv.fr/fr/datasets/r/dacfcb29-7e58-4326-9d34-8ea7c5a9466c",
  t2Large: "https://www.data.gouv.fr/fr/datasets/r/e7cae0aa-5e36-4370-b724-6f233014d0d6",
  t2Small: "https://www.data.gouv.fr/fr/datasets/r/7a5faf5f-7e3b-4de6-9f1d-a8e3ad176476",
  elus: "https://www.data.gouv.fr/fr/datasets/r/f736f325-d42b-4ccf-a82c-e97122bc4861",
} as const;

/** 2014: communes of 1,000 inhabitants and more only, one file per round. */
export const MUNICIPALES_2014_FILES = {
  t1: "https://www.data.gouv.fr/api/1/datasets/r/936f6d38-5969-46e5-8b9d-c7646d6390ec",
  t2: "https://www.data.gouv.fr/api/1/datasets/r/28ed59fd-d285-42f1-9eb6-d82ff2eaa4b3",
} as const;
