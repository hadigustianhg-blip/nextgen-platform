# Season 1 — Implementation Plan

Dokumen ini adalah urutan implementasi Season 1. Sprint 1 saat ini mencakup schema dan
migration development saja; migration belum dijalankan ke production dan belum ada
service, API, UI, scraper, atau deployment.

## Kondisi foundation

Yang sudah tersedia dan tidak perlu dibangun ulang:

- Prisma PostgreSQL dengan `DATABASE_URL` dan `DIRECT_URL`;
- Tenant, Outlet, User, Role, UserRole;
- session server-side yang membawa tenant/outlet/user/roles;
- AuditLog dan helper writer;
- IntegrationCredential + enkripsi;
- module boundary placeholder untuk pickup, dispatch, COD, payment, settlement;
- Next.js standalone Railway.

Gap sebelum Season 1:

- outlet session dapat null; policy active outlet belum ada;
- AuditAction tidak mempunyai action `SYNC`, sehingga desain memakai CREATE + entityType;
- middleware belum multi-tenant dan hard-coded SUM001A/BDO000;
- belum ada contract fixture untuk tiga endpoint legacy;
- aturan bisnis sudah difinalkan, tetapi kontrak endpoint COD belum menyediakan label
  TYPE `Qris COD` yang dibutuhkan aturan klasifikasi.

## Gate 0 — kontrak teknis dan keputusan tersisa

Keputusan bisnis utama berada di `SEASON1_FINAL_BUSINESS_RULES.md`. Jangan membuat
migration sebelum item teknis berikut diselesaikan:

1. Middleware meneruskan label TYPE, atau tersedia codebook resmi kode
   `repaymentType` → label.
2. Field/formula RAW_DISPATCH yang membentuk `dfodAmount`.
3. Unique key final setelah replay lintas status.
4. Aturan pickup multi-payment dan penerapan diskon.
5. Role matrix detail, termasuk konfirmasi overpayment Owner.
6. Retention serta akses PII RAW.
7. Mapping middleware credential/network per tenant/outlet.

## Gate 1 — contract fixtures

- Simpan fixture sanitasi untuk response success, empty, malformed, timeout, expired
  token, pagination boundary, dan 2.000 rows.
- Contract test field, tipe, empty/null, date, and envelope.
- Fixture harus menghapus nama, alamat, waybill, token, serta identifier nyata.
- Pastikan error middleware tidak dibocorkan ke browser/log.

Deliverable:

```text
endpoint client + schemas validator + sanitized fixtures + contract tests
```

Belum ada database write pada gate ini.

## Gate 2 — schema dan migration review

Setelah Gate 0/1:

1. Tambahkan enum dan sepuluh model core, termasuk `SyncRun`.
2. Tambahkan relation fields foundation secara additive saja.
3. Tambahkan unique/index/foreign key tenant-outlet.
4. Tambahkan invariant satu revision `VALID` per transaction key dan review SQL/index
   yang diperlukan.
5. Tambahkan field active/proposed obligation dan reviewer pada MASTER_SETORAN.
6. Tambahkan `firstSeenRunId`/`lastSeenRunId` pada seluruh RAW dan composite foreign key
   agar scope run selalu sama dengan tenant/outlet RAW.
7. Generate satu migration Season 1 di development, bukan production.
8. Review SQL manual untuk cascade, Decimal precision, date/timestamptz, dan index.
9. Uji migration dari database foundation kosong dan snapshot staging.
10. Jalankan `prisma migrate deploy` hanya setelah approval.

Tidak boleh mengedit `20260728000100_initial_foundation`.

## Gate 3 — repository isolation

Bangun repository/service server-only:

- semua method memerlukan trusted `SessionContext`;
- tenant/outlet tidak diterima sebagai authority dari payload client;
- query selalu menyertakan tenant/outlet;
- integration tests tenant A tidak dapat melihat/mengubah tenant B;
- outlet null ditolak atau dipilih melalui policy server.

Tidak ada UI.

## Gate 4 — RAW pickup vertical slice

1. Client middleware server-side.
2. Validator pickup.
3. Idempotent RAW upsert.
4. Lifecycle `SyncRun` serta first/last seen RAW.
5. Normalizer MASTER_PICKUP.
6. Sync audit.
7. Re-sync test.
8. PII log/redaction test.

Acceptance:

- retry menghasilkan count yang sama dan tidak membuat duplicate;
- first seen tetap dan last seen menunjuk replay terbaru;
- SyncRun terminal menyimpan count yang dapat direkonsiliasi;
- payment table tidak disentuh;
- invalid record terlihat sebagai error, bukan nol diam-diam.

## Gate 5 — RAW dispatch dan COD

1. Validator dan upsert dispatch.
2. Validator dan upsert COD.
3. Waybill join/reconciliation.
4. Anomaly report internal.
5. Truncation guard.
6. Sync audit.

MASTER_SETORAN belum dipublish sampai kontrak TYPE COD dapat menjalankan formula final
tanpa menebak kode.

## Gate 6 — MASTER_SETORAN normalization

1. Canonical courier key.
2. Deterministic event selection.
3. Filter hanya status `Penerimaan Normal`.
4. Formula final `totalSetoran = dfod + codTunai`; COD QRIS informasional.
5. Full recompute per tenant/outlet/date.
6. Apply otomatis untuk candidate naik/sama.
7. Candidate turun masuk `proposed*` + `needsReview`.
8. Admin/Owner approve/reject dengan audit.
9. Legacy reconciliation per courier/date.
10. Rebuild/obligation versioning.

Acceptance:

- total raw dan master cocok dengan dataset kontrol;
- mismatch COD/dispatch tidak hilang;
- sync ulang tidak mengubah payment.
- sync naik menghitung ulang status dari seluruh histori payment valid;
- sync turun tidak mengubah kewajiban aktif sebelum review.

## Gate 7 — payment histories

Implementasikan domain service tanpa UI:

- pickup payment transaction create/correct/void;
- multiple settlement payment transactions create/correct/void;
- transfer add/correct/deactivate;
- maksimal delapan transfer per payment pada service;
- transaction key, revision, VALID/SUPERSEDED/VOID invariant;
- Decimal calculation;
- status dinamis BELUM_LUNAS/LUNAS/LEBIH_BAYAR tanpa toleransi;
- warning dan konfirmasi Admin untuk overpayment;
- AuditLog;
- concurrency test.

Acceptance:

- tidak ada hard delete;
- revision lama dapat dibaca;
- two concurrent writes tidak menghasilkan dua revision VALID untuk transaction key;
- aggregate transfer selalu konsisten.
- banyak payment valid dijumlahkan dengan benar;
- nilai lebih tidak menjadi kredit hari berikutnya.

## Gate 8 — API/use-case layer

- endpoint/use case minimal dan server-side;
- request validation;
- role enforcement;
- CSRF/origin protections sesuai pola Next.js;
- sanitized errors;
- pagination/filter scoped;
- rate limit sync;
- observability tanpa PII.

Masih tanpa UI jika scope tahap implementasi berikutnya belum mengizinkan.

## Gate 9 — staging and reconciliation

1. Backup staging.
2. `prisma migrate deploy`.
3. Sync tanggal kontrol.
4. Bandingkan row count, unique waybill, nominal per courier, anomaly.
5. Jalankan payment sandbox.
6. Re-sync dan buktikan payment tidak berubah.
7. Tenant/outlet isolation tests.
8. Load/pagination test.

## Gate 10 — UI

UI hanya dimulai setelah seluruh gate data lulus dan ada instruksi tahap baru. UI tidak
termasuk pekerjaan saat ini.

## Rollout production aman

1. Backup dan restore drill.
2. Additive migration.
3. Deploy backend dengan sync off.
4. Read-only sync satu outlet pilot.
5. Reconciliation dan sign-off.
6. Aktifkan payment untuk role terbatas.
7. Monitor audit/anomaly.
8. Perluas tenant/outlet hanya setelah middleware multi-tenant.

## Test minimum

- contract parsing seluruh field;
- payload hash canonical;
- unique key and idempotency;
- date/timezone DST-independent untuk Asia/Jakarta;
- Decimal, negative, very large, fractional;
- duplicate/event transition;
- COD-dispatch mismatch;
- courier alias/case;
- tenant/outlet isolation;
- revision and concurrent update;
- obligation decrease review and reviewer authorization;
- dynamic status after obligation increase/decrease;
- maximum eight transfers per transaction;
- overpayment confirmation;
- sync does not mutate manual tables;
- audit redaction;
- lifecycle/count SyncRun dan isolasi tenant/outlet;
- 2.000-row truncation;
- endpoint timeout/token expired.

## Definition of done Season 1 data layer

- keputusan bisnis terdokumentasi;
- contract fixtures sanitasi tersedia;
- migration additive lolos review;
- RAW lossless terhadap response middleware;
- MASTER deterministik/rebuildable;
- PAYMENT immutable by sync;
- revision dan audit lengkap;
- tenant/outlet isolation teruji;
- production reconciliation tanpa unexplained variance.
