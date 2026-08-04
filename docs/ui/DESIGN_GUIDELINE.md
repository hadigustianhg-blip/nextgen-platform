# NEXTGEN UI Design Guideline

## Tujuan
Redesign frontend agar tampil seperti SaaS modern, tanpa mengubah business logic.

## Wajib dipertahankan
- Semua endpoint dan kontrak API
- Query, state management, route, dan autentikasi
- Nama menu dan struktur data
- Seluruh KPI, grafik, tabel, dan filter
- Hak akses tenant/outlet

## Boleh diubah
- Layout, spacing, radius, typography
- Sidebar, header, card, button, input, badge, modal
- Responsiveness dan empty state
- Ikon visual menggunakan Lucide

## Struktur utama
- Sidebar desktop: 248–260 px
- Header: tinggi 72–80 px
- Background aplikasi: `#F5F7FB`
- Card: putih, radius 16–18 px
- Border: `#E5E7EB`
- Shadow lembut, tidak berlebihan
- Konten utama memiliki padding 24–28 px

## Header
Urutan elemen:
1. Search bar
2. Outlet aktif
3. Notifikasi
4. Avatar dan role

## Sidebar
- Background `#08172F`
- Logo versi light
- Menu aktif memakai gradient biru
- Gunakan Lucide icon existing
- Submenu tetap mempertahankan nama dan route
- Bagian bawah dapat memakai ilustrasi `sidebar-logistics.svg`

## Komponen
### Button
- Radius 10–12 px
- Primary: `#2563EB`
- Hover: `#1D4ED8`

### Table
- Header abu sangat muda
- Hover row
- Border tipis
- Pagination modern

### Status
- Success: `#16A34A`
- Warning: `#F59E0B`
- Danger: `#DC2626`

## Larangan
Jangan hardcode warna di banyak file. Gunakan CSS variables, Tailwind tokens, atau theme file.
Jangan mengganti API, nama field, route, atau business logic ketika melakukan redesign.
