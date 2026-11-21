# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/cryptotainment/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/cryptotainment/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
competition ("Read broken CSV files faster, 21 November 2026").

`solve.js` exports `run(input)`, which returns exactly the answer csv-reader 1.0.0
returns for every input — the same reading, the same errors (`stray_cr`,
`quote_junk`, `unterminated_quote`, `short_row`, `long_row`), in the same order —
and is about 3x faster than the reference on the practice set. `main.ts` is the
house driver: it reads every case from `/input/cases.json`, answers each with
`run`, and writes `/output/answers.json`.

How it is faster: the reference reads one character at a time and builds every
field a character at a time. This one splits a record that holds no quote in a
single native call, finds a quoted field's closing quote with `indexOf` and
slices its value out, and finds an unquoted field's end with a single regex
search for the next delimiter — no per-character concatenation anywhere.

## License

MIT — see [LICENSE](LICENSE).
