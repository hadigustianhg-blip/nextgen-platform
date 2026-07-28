# Peta Google Sheet Legacy NEXTGEN

Semua spreadsheet bisnis yang ditulis eksplisit menggunakan ID yang sama: `1spXcewve7ZLj01SHrvuIgZcaiI2lQiyCr836c-Yh6g8`. Nilai ini muncul pada `Setoran.gs`, `SalaryFinance.gs`, `CashflowJFS.gs`, `ProfitLoss.gs`, `SettlementHistory.gs`, dan `TransferVerification.gs`.

| Sheet | Pemakai dan fungsi |
| --- | --- |
| `MASTER_LOGIN` | Auth dan Settings. Kolom: ID, Nama, Divisi, Status, Password. Password plaintext. |
| `SCRAPING_ID` | Connect JFS. Header dicari dengan alias ID/username dan password/pass; row 2 adalah akun aktif. Credential plaintext. |
| `MASTER_TEAM` | Opsi/nama team, rekening/WhatsApp, komponen salary; dipakai transfer, operasional, salary. |
| `MASTER_SETORAN` | Working table delivery settlement. Kolom inti: Nama, DFOD, COD cash, COD QRIS, total setoran, tunai, total transfer, rincian transfer, belum bayar, keterangan/status. |
| `HISTORY_SETORAN` | Snapshot closing delivery + timestamp/team closing; dibaca Payment/Settlement History. |
| `RAW_DISPATCH` | Sumber mentah delivery; dibersihkan setelah closing/reset. |
| `RAW_COD` | Sumber mentah COD; dibersihkan setelah closing/reset. |
| `MASTER_PICKUP` | Working table pickup settlement: tanggal, waybill, staff, pengirim, ongkir, diskon, diterima, status, metode, rekening/keterangan. |
| `HISTORY_PICKUP` | Snapshot closing pickup; sumber Payment Pickup dan Dokumen Tagihan. |
| `RAW_PICKUP` | Sumber mentah pickup; dibersihkan setelah closing/reset. |
| `TRANSFERMAIN` | Log transfer manual; source lama “wide” dimigrasikan ke transaction log dan backup sheet bernama dinamis dapat dibuat. |
| `CSV_DATA` | Hasil import mutasi KlikBCA; dibuat bila belum ada, dapat dikosongkan. |
| `DATA_VERIFIKASI` | Hasil pencocokan transfer/mutasi yang dibaca UI. |
| `PAYMENT` | Rekap payment per tanggal/periode; header audit rekap dapat ditambahkan. Input manual tertentu dibersihkan saat reset. |
| `CASHOUT_PAYMENT` | Dibuat bila belum ada. Header: tanggal, nominal cashout, kategori, keterangan, nama bank, bukti transfer, ID cashout, input oleh, waktu input. |
| `OPS_HARIAN` | Tanggal, kategori, nama, nominal, keterangan dan data operasional harian. |
| `MONITORING_HARIAN` | Tanggal, kurir, delivery, TTD, pending, berat TTD, SLA, target, status, berat/omzet pickup. |
| `DATA_BULANAN` | Snapshot closing monitoring harian; 13 header eksplisit termasuk waktu/oleh closing. |
| `RAW_MONITORINGPU` | Raw monitoring pickup; dibersihkan saat closing/reset. |
| `RAW_MONITORINGSH` | Raw monitoring dispatch; dibersihkan saat closing/reset. |
| `MONITORING_BULANAN` | Rekap team bulanan. |
| `MONITORING_BULAN` | Trend harian untuk monitoring/dashboard bulanan. |
| `SLA_REKAP` | Row SLA harian/periode: tanggal, SLA, paket sampai, TTD, belum TTD, lewat SLA, status. |
| `VIEW_DATA_INVENTORY` | Data waybill stuck dengan header yang dicari via alias: source waybill, current site/time, goods, abnormal time, void, scan types, problem. |
| `DETAIL_PENDING` | 12 kolom: waybill, dispatch time, kurir, penerima, HP/telp, alamat, berat, kendala, update time, COD, barang. |
| `DETAIL_PENJADWALAN` | Waybill, pengirim, HP, alamat, barang, source, tanggal; header dicari via alias. |
| `PAKET_PENDING` | Disebut dalam daftar backup/formula-preserved/reset preview; tidak ada reader langsung dalam source yang tersedia. |
| `CASH_IN` | Matrix cash inflow JFS berdasarkan bulan/tahun. |
| `CASH_OUT` | Matrix cash outflow JFS berdasarkan bulan/tahun. |
| `PEMASUKAN_REKAP` | Block pemasukan auto kolom A–E dan manual G–K. |
| `PENGELUARAN_REKAP` | Block NEXTGEN A–E, JFS G–K, manual M–Q. |
| `REKAP_SALARY` | Sumber recap penghasilan team/closing. |
| `KASBON` | Transaksi kasbon team. |
| `DATA_CLOSING` | Data salary yang sudah masuk closing; dibuat beserta header bila tidak ada. |
| `DATA_SALARY` | Data payment/publish salary; dibuat beserta header bila tidak ada. |
| `FIX_SALARY` | Hasil salary final/fixed; dibuat beserta header bila tidak ada. |
| `HISTORY_SALARY` | History setelah ending salary; dibuat beserta header bila tidak ada. |
| `SYSTEM_LOG` | Dibuat bila belum ada untuk process name, tanggal operasional, status, jumlah data, pesan, detail. |

## Sheet temporer/dinamis

- Backup `TRANSFERMAIN_BACKUP_*` dibuat saat migrasi layout wide.
- Spreadsheet sementara dibuat untuk export Excel, kemudian dibuang setelah file XLSX dibuat.
- Folder Drive: `NEXTGEN_BACKUP`, folder invoice Dokumen Tagihan, `NEXTGEN_CASHOUT_PROOF`, dan folder slip salary (nama dari Script Properties/fallback source).

## Operasi destructive yang terlihat

- Closing membersihkan master/raw hanya setelah append history berhasil.
- Reset menghapus row mulai baris kedua pada raw/history/data tertentu; formula/master tertentu dipertahankan.
- `PAYMENT` hanya membersihkan input manual yang ditentukan source.
- Transfer CSV dapat dikosongkan melalui UI.
- Source mengandalkan `LockService` dan sebagian validasi “expected data” untuk mengurangi overwrite bersamaan, tetapi tidak mempunyai transaksi database.

## Keterbatasan

Formula, data validation, protected ranges, actual headers di luar fallback, dan relationship implisit antarsheet tidak terdapat dalam ZIP. `PAKET_PENDING` hanya disebut dalam konfigurasi backup/reset. Mapping ini tidak mengasumsikan formula yang tidak terlihat.
