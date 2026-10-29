# Benchmark

Scan site work with a phone, review it live with the office in 3D or on 2D drawings, check it against the design, then release it with sign-offs and an as-built record.

- `index.html`: the web app (engineering and review side).
- `bmk-cloud.js`: connects the app to Supabase (sign-in, database, live updates, file storage, live review rooms).
- `demo/`: example scans and drawings for the example projects.
- Database: Supabase project `benchmark` (migrations `benchmark_core` and `harden_functions`).

The iPhone app (scan + field review) uses the same Supabase project.
