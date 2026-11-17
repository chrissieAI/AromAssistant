# AromAssistant

A public, searchable snapshot of two aromatherapy reference bases — **ApotheChrissy** (the newer, fuller one) and **AromAssistant** — plus a simple website that runs on GitHub Pages.

The live app, once Pages is on, is: <https://chrissieai.github.io/AromAssistant/>

This copy is for oils, recipes, herbs, chemistry, and vendors. Practitioner-identity records and private practice records are not in this repository.

## Backup date

The data was exported from Airtable on **November 17, 2026 at 12:08 AM America/New_York (EST)**.

## What’s in the repo

- `index.html`, `assets/` — static web app (no build step). Serves from the `main` branch root.
- `data/<base>/<table>.json` and `.csv` — one file pair per table. Linked records are ID arrays in JSON, and primary-field names joined with `; ` in CSV.
- `data/<base>/attachments/<table>/` — downloaded files (recipe pictures and other resources).
- `schema/<base>.json` — tables, fields, types, descriptions, and select options.
- `schema/LINKS.md` — every linked-record field and the table it points to.

Default base in the app is ApotheChrissy. Use the toggle to switch to AromAssistant.

## Drop calculator

The in-app calculator uses the formula from the Drop Calculator table:

- milliliters: `drops = amount × dilution% × 0.2`
- ounces: `drops = amount × dilution% × 6`

Dilution guidance from that table: **1%** children 2+, pregnant/nursing, elderly, or immunocompromised; **2%** healthy adult; **3%** acute, short-term, small area. Higher percentages only in special circumstances.

## How to re-run the export

1. Read both Airtable bases (AromAssistant `apptAxmIxHhT3h0Tr` and ApotheChrissy `app4F6lIubDDWk0Ne`) with a read-only token or connector. List each table’s schema, then page through records. Stay under about 5 requests/second on the free plan, and retry politely if rate-limited.
2. Do not read or write private practice tables or the practitioner-identity table, and drop any fields that link to them. Do not put that information in this public repo.
3. Write records as `data/<base-slug>/<table-slug>.json` (`id`, `createdTime`, `fields`; links as ID arrays) and a matching CSV (links rendered as primary names, `; `-separated).
4. Write `schema/<base-slug>.json` and refresh `schema/LINKS.md`.
5. Store attachment URLs and filenames in JSON, and download the files into `data/<base-slug>/attachments/<table-slug>/` when the total is under ~200 MB.
6. Keep this site’s `index.html` and `assets/` at the repo root, with `.nojekyll`, so Pages can serve from `main` / root.

If both field names would otherwise collide (Oils has two “Botanical Name” columns), export the text column as `Botanical Name (text)`.
