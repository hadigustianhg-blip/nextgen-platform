# NEXTGEN DEV JFS Waybill Helper

Versi ini hanya untuk NEXTGEN DEV. Extension Manifest V3 ini membuka helper Penyesuaian Pickup NEXTGEN DEV setelah pembuatan resi JFS berhasil.

## Instalasi di Chrome Desktop

1. Extract file ZIP.
2. Buka `chrome://extensions`.
3. Aktifkan **Developer mode**.
4. Klik **Load unpacked**.
5. Pilih folder `nextgen-jfs-helper` hasil extract yang berisi `manifest.json`.
6. Pastikan extension dalam keadaan **ON**.
7. Refresh halaman JFS.

Extension hanya berjalan pada `https://jfs.jtcargo.co.id/*` dan hanya membuka `https://dev.nextgen-platform.com/helper/pickup-adjustment`. Extension tidak membaca request header, credential, atau request payload, serta tidak menyimpan, meneruskan, maupun mencatat response payload lengkap. Deduplication hanya menyimpan session key turunan SHA-256 dan timestamp selama 60 detik.
