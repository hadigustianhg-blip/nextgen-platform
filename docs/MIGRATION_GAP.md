# Gap Migrasi Legacy → Fondasi NEXTGEN

## Fitur fondasi baru yang sudah sesuai

| Kebutuhan legacy/target | Fondasi saat ini |
| --- | --- |
| Login dan logout | Sudah ada melalui route handler Next.js. |
| Session server-side | Sudah ada dan lebih aman: token opaque di HTTP-only cookie; database hanya menyimpan hash. |
| Proteksi dashboard | Sudah ada pada proxy dan `requireSession()`. |
| Role | Model Role/UserRole dan kode role target sudah tersedia. |
| User/tenant/outlet | Model Tenant, Outlet, User dan hubungan dasarnya tersedia. |
| Audit | Model AuditLog serta audit login/logout tersedia. |
| Credential integration | Model credential dan AES-256-GCM tersedia. |
| UI dasar | Sidebar gelap, brand NEXTGEN, collapse/mobile, header, logout, card/dashboard responsif sudah searah legacy. |
| Dashboard contract | Typed service layer menerima trusted tenant/outlet context, sehingga mock dapat diganti query. |
| PostgreSQL/Prisma/Railway | Schema awal, migration, seed, strict TypeScript, build standalone, dan README Railway tersedia. |

## Fitur legacy yang belum ada

- Seluruh submenu legacy selain dashboard belum mempunyai workflow.
- Delivery settlement: sync, input tunai/8 transfer, perhitungan clear, history, closing, raw cleanup.
- Pickup settlement: row/bulk adjustment, payment method/account, dedupe dan closing.
- Transfer Main dan verifikasi CSV KlikBCA/manual matching.
- Operasional harian dan kategori/team.
- Monitoring harian/bulanan, SLA period, waybill stuck, insight/chart dan closing.
- Payment settlement, payment pickup, cashout, proof upload, recap audit.
- Dokumen tagihan, PDF, preview dan WhatsApp.
- Data Pendingan dan Penjadwalan Pickup/group WhatsApp.
- Cashflow, Profit & Loss, manual adjustment dan chart.
- Seluruh salary lifecycle: kasbon, recap, closing/cancel, adjustment, payment, PDF/slip, WhatsApp, publish, ending, history.
- Account administration, backup Excel dan reset data.
- Connect JFS dan semua sync.
- Auto-closing/triggers, system log, import/reconciliation jobs.
- Server-side pagination untuk transaksi.
- Data migration dari seluruh sheet dan Drive files.

## Perbedaan fondasi baru dari legacy

- Legacy single-tenant; fondasi mewajibkan `tenantId` dan optional/required `outletId`.
- Legacy login memakai ID + password plaintext; fondasi memakai tenant slug + email + Argon2id.
- Legacy token disimpan di local/session storage dan Script Properties; fondasi memakai cookie HTTP-only dan hashed token di PostgreSQL.
- Legacy divisi efektif adalah OWNER/ADMIN/Staff/Driver dengan inkonsistensi; fondasi mendefinisikan SUPER_ADMIN, OWNER, ADMIN, FINANCE, HR, QC, OPERATIONAL, VIEWER.
- Legacy credential JFS plaintext di Sheet; fondasi menyediakan authenticated encryption.
- Legacy audit tersebar di kolom sheet/SystemLog; fondasi mempunyai AuditLog terstruktur.
- Dashboard fondasi saat ini menampilkan mock yang menyerupai KPI legacy, bukan data hasil Sheet.
- Fondasi belum menyediakan “ingat saya” sebagai pilihan UI; TTL dikonfigurasi server.
- Fondasi memakai email sebagai unique identity per tenant, sedangkan legacy memakai ID login bebas.
- Fondasi belum memodelkan status/divisi legacy secara langsung; mapping user harus ditetapkan sebelum import.

## Gap/risiko yang ditemukan dalam source legacy

- Tidak ada endpoint Railway di arsip, sehingga adapter `jfs-middleware` belum dapat dirancang dari source ini.
- Implementasi fungsi scraper global tidak ada.
- `previewTransferMutationCsv` dipanggil frontend tetapi backend tidak ditemukan.
- Connect JFS memanggil admin guard tanpa token.
- Fungsi Transfer Verification dan Salary mempunyai deklarasi duplikat/backup yang dapat menimpa implementasi.
- Banyak endpoint legacy tidak melakukan authorization backend.
- Credential dan password plaintext.
- Formula Sheet adalah bagian aturan bisnis tetapi tidak tersedia dalam source.
- Pagination legacy dominan client-side dan membaca seluruh range.
- Spreadsheet ID hard-coded dan semua client berbagi satu workbook; tidak ada tenant boundary.

## Urutan migrasi paling aman

1. **Bekukan kontrak dan fixture.** Dapatkan copy sanitasi setiap sheet beserta formula/header, Apps Script scraper yang hilang, trigger aktif, dan dokumentasi `jfs-middleware-v2`. Rekam contoh input/output untuk semua 86 call site.
2. **Peta identitas dan akses.** Tetapkan mapping ID legacy → email/user; Admin/Owner/Staff/Driver → role baru; tenant/outlet; aturan akses per mutasi. Tambahkan admin user/outlet management sebelum data operasional.
3. **Bangun adapter read-only JFS.** Gunakan `jfs-middleware-v2`, credential terenkripsi, timeout/retry/idempotency. Jangan mengubah service produksi. Validasi hasil terhadap raw sheet.
4. **Migrasikan master/reference.** Tenant, outlet, users, roles, master team, categories, account/rekening; buat importer idempotent dan reconciliation.
5. **Delivery vertical slice.** Raw dispatch/COD → master settlement → input/transfer → closing/history → payment summary. Ini menjadi pola tenancy, audit, locking/idempotency, dan pagination.
6. **Pickup vertical slice.** Raw pickup → settlement/adjustment → closing/history → Payment Pickup dan Dokumen Tagihan.
7. **Monitoring dan QC.** Harian → closing bulanan → SLA; lalu pending, penjadwalan dan stuck. Pertahankan definisi SLA 95% dan formula yang sudah diverifikasi.
8. **Transfer dan payment.** Transfer Main, CSV verification/manual match, Payment Settlement/cashout/proof; selesaikan defect `previewTransferMutationCsv` sebagai keputusan eksplisit.
9. **Finance/HR.** Operasional, Cashflow, P&L, lalu salary lifecycle secara berurutan. Salary dipindahkan terakhir karena paling banyak state, output file, dan aturan dedupe.
10. **Settings/operations.** Account management, backup/export, reset yang aman per tenant, system log, job/auto-closing.
11. **Parallel run dan cutover.** Dual-read/reconciliation per module, lalu legacy freeze + delta import. Jangan membersihkan Sheet sampai laporan jumlah row dan total nominal cocok serta rollback disetujui.

## Gerbang wajib sebelum coding modul berikutnya

- Source scraper/middleware contract tersedia.
- Header/formula sample dan data sanitasi tersedia.
- Role matrix baru disetujui.
- Mapping tenant/outlet/user disetujui.
- Definisi monetary rounding, timezone, closing date, dan idempotency key disetujui.
- Keputusan dibuat untuk mismatch source (`previewTransferMutationCsv`, Connect JFS token, duplikasi Transfer Verification/Salary).
