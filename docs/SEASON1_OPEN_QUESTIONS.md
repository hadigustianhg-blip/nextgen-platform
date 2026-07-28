# Season 1 — Open Questions

Dokumen ini hanya memuat keputusan yang benar-benar belum tersedia. Formula DFOD,
mapping repayment type, replay key, dan bentuk pembayaran pickup tidak lagi menjadi
blocker desain; hasil auditnya ada di `SEASON1_BLOCKER_AUDIT.md`.

## Penguatan kontrak source

1. Apakah middleware akan menambahkan `repaymentTypeCode` dan
   `repaymentTypeLabel` tanpa menghapus `repaymentType` lama? Bukti historis menetapkan
   `2 = Qris COD` dan `0/1 = non-QRIS`, tetapi label eksplisit tetap disarankan.
2. Apa kebijakan untuk kode repayment baru, null, atau di luar `0/1/2`? Rekomendasi:
   quarantine sebagai anomaly, jangan masukkan otomatis ke tunai.
3. Apakah upstream mempunyai pickup/dispatch/COD record ID atau receipt ID yang belum
   diteruskan middleware? Bila ada, field itu sebaiknya diteruskan untuk memperkuat
   identitas record.
4. Apakah dua event COD dapat sah dengan waybill, type, dan `signTime` identik? Kasus
   ini tidak muncul pada sampel 26–28 Juli.
5. Apakah dua event dispatch dapat sah dengan waybill dan `sourceTime` identik? Status
   terbukti mutable sehingga tidak boleh menjadi bagian key.

Pertanyaan 1–5 adalah penguatan kontrak dan guard operasional. Candidate key Season 1
tetap dapat dipakai sesuai `SEASON1_SYNC_RULES.md`.

## Database invariants

6. Apakah satu revision `VALID` per `transactionKey` akan dijamin dengan partial unique
   index PostgreSQL atau transaction/service?
7. Apakah model pendukung `PickupSettlementRevision` disetujui sebagai penyimpan diskon
   tunggal aktif dan historinya?
8. Apakah histori setiap proposal penurunan kewajiban cukup melalui AuditLog, atau
   diperlukan tabel `ObligationReview` tersendiri?
9. Jika candidate penurunan baru datang saat proposal lama belum direview, apakah latest
   candidate menggantikan proposal lama dengan audit, atau semua proposal disimpan?

## Authorization

10. Apakah `OWNER` juga boleh mengonfirmasi overpayment, atau hanya `ADMIN`?
11. Apakah correction/void membutuhkan approval user kedua?
12. Role mana yang boleh melihat RAW PII?
13. Apakah FINANCE boleh void transfer/payment atau hanya membuat dan mengoreksi?
14. Apakah user `outletId=null` berarti tenant-wide admin atau user belum lengkap?
15. Apakah `SUPER_ADMIN` boleh mengakses tenant tanpa support session/impersonation yang
    diaudit?

## Multi-tenant dan middleware

16. Bagaimana mapping tenant/outlet ke JFS network code, finance code, dan finance ID?
17. Kapan hard-code `SUM001A`, `BDO000`, serta finance ID 183 dipindahkan menjadi
    konfigurasi per tenant/outlet?
18. Apakah satu tenant dapat mempunyai banyak credential JFS?
19. Siapa yang memilih active outlet untuk user multi-outlet?
20. Apakah scheduled sync memakai system actor khusus di AuditLog?

## Security dan retention

21. Berapa lama nama/alamat pengirim dan penerima disimpan di RAW?
22. Apakah alamat dan detail barang perlu dienkripsi di level aplikasi?
23. Role mana yang melihat alamat penuh versus data masked?
24. Berapa lama rekening tujuan dan nomor referensi transfer disimpan?
25. Apakah nomor rekening/referensi wajib masked pada output dan audit?
26. Berapa retention AuditLog dan apakah diperlukan audit akses PII?

## Operasional sync

27. Apa batas tanggal backfill per request?
28. Apakah empty response valid atau membutuhkan konfirmasi sebelum menghasilkan
    candidate MASTER kosong/turun?
29. Apa tindakan resmi jika dispatch/COD mencapai batas 2.000 record?
30. Berapa timeout, retry count, dan concurrency per tenant/outlet?
31. Berapa lama anomaly COD/dispatch boleh tertunda sebelum settlement diblokir?
32. Apakah manual sync dan scheduled sync boleh berjalan bersamaan?
33. Jika candidate naik ketika proposal penurunan masih pending, apakah proposal langsung
    dibatalkan atau tetap memerlukan review?

## Detail pembayaran

34. Apakah overpayment pickup memerlukan konfirmasi Admin yang sama dengan settlement?
35. Apakah rekening tujuan, nama bank, nomor referensi, dan waktu transfer wajib?
36. Apakah nomor referensi harus unik, dan bila ya dalam scope apa?
37. Apakah correction satu transfer mempertahankan `sequence` lama?
38. Ketika payment direvisi, apakah transfer valid disalin otomatis atau dikonfirmasi
    ulang?

## Precision dan provenance

39. Apakah precision uang final `Decimal(18,2)` atau Rupiah integer scale 0?
40. Apakah precision berat `Decimal(12,3)` cukup?
41. Apakah dibutuhkan tabel lineage record-per-record untuk MASTER_SETORAN?
42. Apakah dibutuhkan tabel sync-run terpisah selain AuditLog?

## Rekomendasi default bila keputusan ditunda

- Kode repayment baru/null menjadi anomaly.
- Gunakan partial unique index untuk satu revision VALID per transaction key.
- Gunakan `PickupSettlementRevision` untuk diskon tunggal aktif.
- Empty/truncated response tidak menurunkan kewajiban aktif otomatis.
- Scheduled sync menggunakan actor system yang dapat dibedakan dari user manusia.
