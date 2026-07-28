# Peta UI Legacy NEXTGEN

## Menu dan submenu

| Menu | Submenu/view |
| --- | --- |
| Dashboard | Dashboard |
| Settlement Center | Delivery Settlement; Pickup Settlement; Verifikasi Transfer; Operasional |
| Monitoring | Monitoring Harian; Monitoring Bulanan; Service Level Agreement; Monitoring Waybill Stuck |
| Payment | Payment Settlement; Payment Pickup; Data Settlement Delivery; Dokumen Tagihan |
| Quality Control | Data Pendingan; Penjadwalan Pickup |
| Finance & HR | Cashflow JFS; Profit & Loss; Kasbon Team; Rekap Penghasilan Team; Closing; Payment Salary; Publish Salary Team; History Salary |
| Pengaturan | Pengaturan Akun; Connect JFS |
| Akun | Identitas user dan Logout |

Sidebar desktop dapat diciutkan; mobile memakai tombol menu dan overlay. Grup menu bersifat accordion. Logout memakai modal konfirmasi.

## Halaman/view

| View | Ringkasan, tabel, form, modal, tombol, dan filter |
| --- | --- |
| Login | Form ID pengguna, password, “ingat saya”, show/hide password, tombol Masuk, error dan auth splash. |
| Dashboard | Kartu hari ini dan bulanan; settlement/payment; donut/progress SLA; grafik bulanan, tren TTD, tren omzet; tombol Refresh dan beberapa “Lihat Detail”. |
| Delivery Settlement | Kartu total; tabel kurir: Nama, DFOD, COD Cash/QRIS, Total Setoran, Bayar Tunai, Transfer, Belum Bayar, Status, Aksi. Search nama/status; Sync JFS, Reset, Simpan Setoran. Modal input 1 tunai + 8 transfer + keterangan dan modal closing. |
| Pickup Settlement | Tabel tanggal, waybill, staff, pengirim, ongkir, diskon, total diterima, status, metode, rekening, keterangan, aksi. Filter waybill/orang/status/metode; select-all dan bulk mode. Modal closing, adjustment per-row, dan konfirmasi bulk. |
| Verifikasi Transfer | Upload CSV, info/preview file, kartu summary, tabel perbandingan pencatatan vs mutasi, status dan aksi. Filter status/search; Proses, Reset, Hapus CSV. Source juga membangun modal detail dan manual matching; partial menyediakan modal delete/note. |
| Operasional | Form tanggal, kategori (+ kategori baru), nominal, nama team kondisional, keterangan; tabel tanggal/kategori/nama/nominal/keterangan/aksi. Search/kategori/tanggal; Refresh, Tambah, Simpan, Reset; modal delete. |
| Monitoring Harian | Kartu ringkasan, insight performa, tabel kurir/delivery/TTD/pending/berat/SLA/target/status/pickup/omzet. Search/status/SLA; Sync JFS, Reset; modal closing dibangun dari script. |
| Monitoring Bulanan | Kartu dan insight; chart SLA, TTD, tonase, omzet; tabel team. Search/status; Refresh dan Reset. |
| SLA | Selector periode, progress target 95%, kartu summary, tabel tanggal/SLA/paket/TTD/belum TTD/lewat SLA/status; tombol Tampilkan Data. |
| Waybill Stuck | Kartu summary; tabel source waybill/site/time/goods/abnormal/void/scan/problem dengan copy action. Search, site, scan type, problem, tanggal; Sync JFS dan Reset. |
| Payment Settlement | Kartu summary, tabel settlement, daftar cashout. Filter periode/tanggal/status; Refresh, Tambah Cashout, Reset. Modal rekap, create/edit cashout dengan upload bukti, delete cashout. |
| Payment Pickup | Kartu summary; tabel pickup dan field status/metode/tanggal/keterangan yang dapat diedit per-row. Filter waybill/orang/status/metode/tanggal pembayaran; Refresh dan Reset. |
| Data Settlement Delivery | Tabel history delivery serta ringkasan. Filter tanggal/status/search; Cek Data dan Reset. Modal edit tunai, 8 transfer, keterangan, ringkasan live. |
| Dokumen Tagihan | Kartu summary; tabel tanggal/waybill/staff/pengirim/ongkir/diskon/diterima/keterangan; grouping dan selection. Filter waybill/pengirim/staff/tanggal/group-by; Generate PDF, Preview PDF, Kirim WhatsApp, Reset. |
| Data Pendingan | Kartu total/berkendala/tanpa kendala; tabel shipment. Filter waybill/penerima/kurir/status kendala; Refresh/Reset. Modal detail dan aksi WhatsApp. |
| Penjadwalan Pickup | Kartu total resi/grup/nomor valid; daftar dikelompokkan pengirim/telepon. Filter waybill/pengirim/source; Refresh/Reset; expand group dan WhatsApp. |
| Cashflow JFS | Bulan/tahun, kartu cash-in/cash-out/net/status, dua tabel rekap; Refresh. |
| Profit & Loss | Bulan/tahun; summary, comparison/composition/trend charts; tabel pemasukan/pengeluaran. Refresh/Tampilkan/Tambah. Modal tambah manual dan delete. |
| Kasbon Team | Rentang tanggal dan nama; kartu summary dan tabel nama/jumlah transaksi/total/tanggal terakhir; Reset/Refresh; modal detail. |
| Rekap Penghasilan Team | Bulan/tahun/search/divisi; summary dan tabel komponen penghasilan; modal detail. |
| Closing Salary | Rentang tanggal/divisi/search; preview dan tabel belum closing; Closing dan Batalkan Closing; modal detail, konfirmasi closing, konfirmasi cancel. |
| Payment Salary | Closing/divisi/search/status; summary dan tabel adjustment/payment. Tombol Adjustment Massal dan Proses Salary; modal bulk target/field/mode, modal per-row adjustment, modal konfirmasi proses, preview slip. |
| Publish Salary | Closing/divisi/search/status; tabel PDF/WhatsApp/publish; generate PDF, WhatsApp, mark sent, Ending Proses; modal ending. |
| History Salary | Tahun/bulan/closing/periode; summary dan tabel history; Refresh/Tampilkan. |
| Pengaturan Akun | Tab akun dan backup/reset. Form ganti password; form tambah akun; filter/search dan tabel akun; Backup Excel/download; reset dua langkah dengan checkbox dan teks konfirmasi. |
| Connect JFS | Status koneksi dan akun; ID/password, show/hide, Edit/Batal/Simpan/Connect. |

## Pagination dan responsivitas

- Banyak list memakai state `page` dan `pageSize`, rendering tabel desktop serta kartu mobile.
- Pagination dibuat client-side melalui `paginateRows`, `renderPagination`, atau variasi module-specific.
- Tabel utama tidak mempunyai ID tetapi memakai `<tbody>` ber-ID untuk rendering.
- UI menyediakan loading skeleton/spinner, empty state, error state, toast, dan modal overlay.

## Daftar tabel dan kolom

Kolom yang tertulis eksplisit di source:

- Delivery: No, Nama Kurir, DFOD, COD Cash, COD QRIS, Total Setoran, Bayar Tunai, Total Transfer, Belum Bayar, Status, Aksi.
- Pickup: No, Tanggal, Waybill, Staff, Pengirim, Ongkir, Diskon, Total Diterima, Status, Metode Bayar, Rekening Transfer, Keterangan, Aksi.
- Transfer verification: No, Tanggal, Nama, Nominal Manual, Mutasi CSV, Selisih, Status, Keterangan, Aksi.
- Operasional: Tanggal, Kategori, Nama, Nominal, Keterangan, Aksi.
- Monitoring harian: No, Nama Kurir, Delivery, Tanda Terima, Pending, Berat TTD, SLA, Target, Status, Berat Pickup, Omzet Pickup.
- Monitoring bulanan: No, Nama Team, Total Delivery, Jumlah TTD, Jumlah Pending, SLA, Tonase Pickup, Omzet, Status.
- SLA: No, Tanggal, SLA, Paket Sampai, Sudah/Belum TTD, Lewat SLA, Status.
- Waybill stuck: No, Source Waybill, Current Scan Site/Time, Goods Name, Abnormal Register Time, Is Void, Current Scan Type, Scan Type, Problem Reason.
- Payment settlement: No, Tanggal, COD Tunai, Pickup Tunai, Transfer Shipment/Pickup, Total Bayar Tunai, Operasional, Nominal Setor Bank, Sisa Cash, Status, Aksi.
- Payment pickup dan dokumen tagihan: tanggal, waybill, staff, pengirim, nominal/status/payment fields.
- Settlement history: kolom delivery ditambah Tanggal Closing, Team Closing.
- Finance/HR: cashflow; kasbon; income components; closing adjustments; PDF/WhatsApp/publish statuses; history.
- Settings: ID, Nama, Divisi, Status.

## Modal global dan module-specific

Logout; delivery input/closing; pickup closing/adjustment/bulk; settlement history edit; payment recap/cashout/delete; operasional delete; pending detail; profit/loss manual/delete; salary detail, loan detail, closing/cancel, payment, bulk adjustment, row adjustment, ending, slip preview; transfer verification delete/note serta detail/manual/duplicate yang dibangun lewat JavaScript; reset data.
