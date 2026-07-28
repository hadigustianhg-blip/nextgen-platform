# Audit Read-only Aplikasi Legacy NEXTGEN

## Ruang lingkup dan metode

Audit dilakukan pada 28 Juli 2026 terhadap ZIP `saya-sedang-membangun-google-apps-script.zip`. Folder `legacy-appscript/` belum ada di repository; root aplikasi di dalam ZIP bernama `saya-sedang-membangun-google-apps-script/`. Arsip diekstrak ke direktori sementara dan dibaca tanpa mengubah source. Repository fondasi tidak diubah selain lima dokumen di `docs/`.

Isi efektif yang diperiksa:

- 28 file `.gs` utama, termasuk `PATCH_KASBON_ONLY.gs` dan `SalaryFinance.empty-backup.gs`;
- 25 file `.html` pada root aplikasi, termasuk partial/page, `index.html`, `sidebar.html`, `style.html`, dan `script.html`;
- 691 deklarasi fungsi bernama pada `script.html`;
- prototype statis `outputs/nextgen-gh-pages` (`index.html`, CSS, serta `auth.js`, `api.js`, `app.js`, `config.js`);
- file metadata kosong dan `.gitignore` pada artefak output.

Tidak ada file `.css` atau `.js` terpisah pada aplikasi Apps Script utama: CSS berada dalam `style.html`, dan JavaScript utama berada dalam `script.html` serta `Profit-Loss.html`.

## Bentuk aplikasi

`Main.gs#doGet()` merender `index.html`; `include(filename)` menyisipkan partial. Aplikasi adalah single-page UI dengan semua view berada di DOM, lalu `script.html` mengatur navigasi, state, filter, pagination client-side, modal, dan komunikasi `google.script.run`.

Alur boot:

1. `DOMContentLoaded` mengikat kontrol auth dan menjalankan `initializeNextgenAuth`.
2. Token dibaca dari `localStorage` bila “ingat saya” aktif, selain itu dari `sessionStorage`.
3. `validateNextgenSession(token)` dipanggil.
4. Jika valid, UI aplikasi ditampilkan, identitas user dipasang di sidebar, kontrol menu berbasis divisi diterapkan, lalu dashboard dibuka.
5. Logout menghapus property session di server serta kedua storage browser.

## Source backend yang dibaca

| Area | File |
| --- | --- |
| Entry/auth/settings | `Main.gs`, `Auth.gs`, `Settings.gs`, `ConnectJfsSettings.gs`, `SystemLog.gs`, `AutoClosing.gs`, `PeriodHelper.gs` |
| Dashboard/monitoring/QC | `Dashboard.gs`, `MonitoringHarian.gs`, `MonitoringBulanan.gs`, `SlaMonitoring.gs`, `MonitoringWaybillStuck.gs`, `DataPendingan.gs`, `PenjadwalanPickup.gs` |
| Settlement/payment | `Setoran.gs`, `SettlementHistory.gs`, `PickupSettlement.gs`, `PaymentSettlement.gs`, `PaymentPickup.gs`, `TransferMain.gs`, `TransferVerification.gs`, `DokumenTagihan.gs` |
| Finance/HR | `Operasional.gs`, `CashflowJFS.gs`, `ProfitLoss.gs`, `SalaryFinance.gs`, `PATCH_KASBON_ONLY.gs` |
| Backup | `SalaryFinance.empty-backup.gs` (versi lebih kecil/lebih lama dari sebagian fungsi salary) |

## Aturan autentikasi, role, dan session

- Identitas login adalah `ID` pada `MASTER_LOGIN`; pencocokan ID case-insensitive.
- Password legacy dibaca dan dibandingkan sebagai plaintext. Penggantian dan pembuatan akun juga menulis plaintext.
- User harus berstatus `AKTIF`.
- Token adalah UUID dan session JSON disimpan di `PropertiesService.getScriptProperties()` dengan prefix `NEXTGEN_SESSION_`.
- Session normal berlaku 12 jam; “ingat saya” berlaku 30 hari.
- Session berisi token, user ID, nama, divisi, dan expiry. Setiap validasi memeriksa expiry serta status user terbaru.
- Divisi/role yang terlihat di source tidak konsisten: validasi pembuatan akun hanya mengizinkan `Admin`, `Staff`, `Driver`, sedangkan otorisasi juga mengenali `OWNER`.
- Semua non-finance view dapat dibuka oleh user yang login.
- Owner dapat membuka seluruh Finance & HR serta Pengaturan.
- Admin hanya melihat `Kasbon Team` di Finance & HR, tetapi dapat membuka Pengaturan.
- Edit settlement history, bulk adjustment pickup, dan cashout dibatasi backend ke `ADMIN`/`OWNER`.
- SLA hanya memerlukan session valid.
- Sebagian endpoint data/mutasi lain tidak menerima token dan tidak melakukan pemeriksaan session di backend; kontrolnya hanya melalui UI Apps Script.

## Aturan perhitungan yang terlihat

- Delivery settlement: `belumBayar = totalSetoran - (bayarTunai + totalTransfer)`. Status `Clear` bila selisih absolut ≤ 1; selain itu `Belum Clear`.
- Ringkasan delivery menjumlahkan DFOD, COD Cash, COD QRIS, total setoran, tunai, transfer, belum bayar, jumlah kurir, clear, dan belum clear.
- Pickup: `totalTagihan` adalah jumlah `totalDiterima`; status tepat `SUDAH BAYAR` menentukan paid/unpaid. Metode `TUNAI` dan `TRANSFER` membentuk subtotal.
- Payment settlement: `grandTotalSisaCash = totalSisaCash - totalCashout`; total bayar tunai dan operasional dijumlahkan per periode.
- Monitoring harian: `slaKeseluruhan = totalTTD / totalDelivery`, atau 0 jika delivery 0. Status row memakai status sheet bila tersedia, lalu fallback `persentaseTTD >= target`.
- SLA period: target konstan 95%; `Achieve` bila nilai + 0,0001 ≥ 95.
- Profit & Loss: laba bersih = total pemasukan − total pengeluaran; status `Profit`, `Loss`, atau `Break Even`. Pemasukan/pengeluaran juga dihitung persentasenya terhadap total masing-masing.
- Salary final: penghasilan awal + overtime/adjustment + pemasukan lain − kasbon − pengurangan lain.
- Bulk salary adjustment dapat `replace` atau menambahkan nilai sekarang. Kasbon periode dijumlah berdasarkan nama ternormalisasi dan rentang tanggal.
- Penjadwalan pickup mengelompokkan `nomor telepon ternormalisasi|nama pengirim`; nomor Indonesia `0...`/`8...` dinormalisasi menjadi `62...`.
- Data Pendingan diurutkan dengan yang belum memiliki kendala terlebih dahulu, lalu update terbaru, lalu waybill.
- Closing pickup memakai waybill sebagai kunci deduplikasi history. Closing monitoring dan settlement memakai kombinasi tanggal/nama.
- Nilai `#N/A`, `#REF!`, `#VALUE!`, dan `#ERROR!` umumnya dianggap tidak valid.
- Zona waktu bisnis yang digunakan adalah `Asia/Jakarta`.

## Alur data dan closing

- Sync/refresh menarik data melalui fungsi global scraper/helper, melakukan `SpreadsheetApp.flush()`, lalu membaca sheet hasil.
- Pickup closing menyalin row dari `MASTER_PICKUP` ke `HISTORY_PICKUP`, menambahkan waktu/user closing, melewati waybill duplikat, lalu membersihkan master/raw.
- Delivery closing menyalin hasil ke `HISTORY_SETORAN`, mencegah kunci tanggal/nama duplikat, lalu membersihkan master/input manual dan raw dispatch/COD.
- Monitoring closing menyalin hasil harian ke `DATA_BULANAN`, mencegah tanggal/nama duplikat, lalu membersihkan raw pickup/dispatch monitoring.
- Salary mempunyai lifecycle preview → closing → adjustment → payment/batch → PDF/WhatsApp → ending/history, termasuk pembatalan selama belum ada salary yang dibayar.
- Transfer mutation mengimpor CSV KlikBCA ke `CSV_DATA`, membaca hasil `DATA_VERIFIKASI`, mendukung catatan/manual match pada UI, dan pembersihan CSV.
- Backup membuat spreadsheet sementara berisi daftar sheet tertentu, mengekspor XLSX melalui Google Drive API, menyimpan file ke folder `NEXTGEN_BACKUP`, lalu membuang spreadsheet sementara.
- Reset menghapus row data tertentu tetapi mempertahankan formula/master sesuai daftar eksplisit di `Settings.gs`.

## Integrasi eksternal dan endpoint

Tidak ada endpoint Railway, hostname `jfs-middleware`, `jfs-middleware-v2`, atau URL HTTP scraper di source yang diaudit.

Yang terlihat:

- Google Drive API export: `https://www.googleapis.com/drive/v3/files/{id}/export?...`;
- WhatsApp deep link: `https://wa.me/{number}?text=...`;
- Google Fonts pada UI;
- sinkronisasi memanggil fungsi global `loginJfsDariSheet`, `tarikPickup`, `tarikDFOD`, `tarikCOD`, `syncPickupmonitoring`, `syncDispatchmonitoring`, `tarikDetailPending`, `syncPUMP`, dan fungsi terkait lain yang implementasinya tidak terdapat dalam ZIP.

Karena implementasi fungsi global itu tidak ada, endpoint Railway, payload, autentikasi, retry, timeout, dan mapping responsnya tidak dapat disimpulkan.

## Temuan source yang perlu dipertahankan sebagai fakta

- `script.html` berisi dua blok implementasi Transfer Verification dengan beberapa nama fungsi duplikat; deklarasi yang muncul paling akhir akan menimpa deklarasi sebelumnya di JavaScript.
- UI memanggil `previewTransferMutationCsv`, tetapi fungsi backend tersebut tidak ditemukan di `TransferVerification.gs` atau file `.gs` lain.
- `getJfsConnectionSettings`, `saveJfsConnectionSettings`, dan `connectJfsFromSettings` memanggil `requireSettingsAdmin_()` tanpa token, sedangkan fungsi tersebut memvalidasi token; sesuai source yang ada, pemanggilan ini tidak konsisten.
- Credential JFS disimpan plaintext pada sheet `SCRAPING_ID`.
- Password login disimpan plaintext pada `MASTER_LOGIN`.
- Spreadsheet ID yang sama ditulis langsung pada beberapa file.
- `SalaryFinance.empty-backup.gs` mendeklarasikan nama fungsi yang juga ada pada `SalaryFinance.gs`; bila keduanya aktif dalam project yang sama, deklarasi terakhir yang dimuat menentukan implementasi efektif.
- Prototype `outputs/nextgen-gh-pages` adalah shell statis terpisah dengan `API_BASE_URL` kosong; tidak merepresentasikan backend produksi yang lengkap.

## Batas audit

Audit hanya menyatakan perilaku yang terlihat di arsip. Formula Google Sheet, Apps Script lain yang tidak disertakan, trigger yang sudah terpasang, data aktual, urutan load efektif untuk deklarasi duplikat, dan kontrak middleware Railway tidak tersedia sehingga tidak ditebak.
