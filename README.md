# MFlash Maintenance & Service — Sistem Langganan

Aplikasi web terpisah dari dashboard sewa, dengan cara deploy yang sama: GitHub → Cloudflare Pages, database di Supabase (project baru).

## Isi paket

| Folder / file | Fungsi |
|---|---|
| `supabase/schema.sql` | Database lengkap: cabang, akun, paket, benefit, pelanggan, akad, tagihan, kunjungan, kewajiban benefit, log, dan mesin tagihan otomatis |
| `supabase/02_storage.sql` | Tempat file tanda tangan, PDF akad, bukti bayar, dan foto kunjungan |
| `supabase/functions/kirim-pengingat/` | Pengirim email pengingat otomatis |
| `supabase/03_jadwal_email.sql` | Jadwal email harian jam 08:00 WIB |
| `web/` | Aplikasinya (upload folder ini ke GitHub) |

## Cara pasang (±30 menit)

**1. Buat project Supabase baru**
- Di supabase.com, buat project baru (misalnya `mflash-maintenance`) dengan region Singapore.
- Aktifkan extension `pg_cron` di Database → Extensions.

**2. Jalankan database**
- Buka SQL Editor, lalu tempel dan jalankan `schema.sql`.
- Setelah itu, jalankan `02_storage.sql`.

**3. Buat akun Super Admin pertama**
- Buka Authentication → Users → Add user. Isi email dan password, lalu centang Auto Confirm.
- Di SQL Editor, jalankan perintah berikut (ganti emailnya):
  ```sql
  insert into profil (user_id, nama, peran)
  select id, 'Nama Anda', 'super_admin' from auth.users where email = 'email@anda.com';
  ```
- Akun berikutnya (Super Admin kedua dan 18 admin cabang) bisa diatur dari aplikasi di menu Pengaturan → Akun, setelah user-nya dibuat di Authentication.

**4. Hubungkan aplikasi**
- Buka `web/config.js`, lalu isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dari Project Settings → API.
- Push folder `web/` ke repo GitHub baru.
- Di Cloudflare Pages, buat project baru → Connect to Git → pilih repo tersebut. Kosongkan Build command dan isi Output directory dengan `/` (atau `web` bila repo berisi seluruh folder).

**5. Isi data master (login sebagai Super Admin → Pengaturan)**
- **Paket**: harga per unit per bulan, jumlah kunjungan per bulan, dan durasi minimal kontrak.
- **Benefit wajib**: daftar kewajiban MFlash beserta frekuensinya (bulanan, triwulan, semester, tahunan, atau sekali).
- **Umum**: rekening pembayaran (muncul di pesan tagihan), target mitra aktif (default 162), dan alamat email pengirim.

**6. Email otomatis (opsional, bisa belakangan)**
- Daftar di resend.com (gratis 3.000 email per bulan), verifikasi domain `mflash.co.id`, lalu buat API key.
- Deploy fungsinya dengan Supabase CLI:
  ```
  supabase functions deploy kirim-pengingat
  supabase secrets set RESEND_API_KEY=re_xxx
  ```
- Buka `03_jadwal_email.sql`, isi `<PROJECT_REF>` dan `<SERVICE_ROLE_KEY>`, lalu jalankan di SQL Editor.

## Cara kerja sehari-hari

1. **Pelanggan baru** → buat **Akad** (unit, harga, tanggal mulai, durasi, dan tanggal jatuh tempo).
2. Pelanggan dan MFlash **tanda tangan di layar** (HP atau tablet). Setelah itu PDF akad tersimpan dan status menjadi **aktif**.
3. Sistem otomatis membuat **tagihan bulanan**, **jadwal kunjungan**, dan **kewajiban benefit** tiap bulan. Tagihan bulan depan sudah dibuat sejak awal, supaya pengingat H-7 sempat terkirim.
4. Menu **Pengingat** menampilkan semua yang jatuh tempo dalam 7 hari ke depan atau sudah terlambat. Klik tombol WhatsApp dan pesan sudah terisi. Email otomatis terkirim pada H-7, H-3, H-0, lalu H+3, H+7, dan H+14 untuk tagihan.
5. Admin menandai **lunas**, mengisi **laporan kunjungan** (foto, biaya, tanda tangan berita acara), dan mencatat **benefit dipenuhi**.
6. **Dashboard** menampilkan mitra aktif vs target, pendapatan berulang, gross profit (tagihan dikurangi biaya kunjungan dan benefit), tingkat pembayaran, piutang terlambat, dan performa per cabang.

## Aturan akses
- **Super Admin**: melihat semua cabang (dengan filter), mengatur paket, benefit, target, dan akun, serta melihat log aktivitas.
- **Admin cabang**: hanya melihat dan mengubah data cabangnya sendiri. Aturan ini dijaga langsung di database, bukan hanya di tampilan.
- Akad yang ditangguhkan, diakhiri, atau dibatalkan otomatis membatalkan tagihan dan kunjungan ke depan yang belum berjalan.

## Catatan
- Isi pasal akad adalah template umum. Minta tim legal meninjaunya, lalu teks bisa diubah di fungsi `pasalAkad` pada `web/app.js`.
- Tanda tangan elektronik di layar tercatat dengan waktu dan nama penanda tangan. Untuk kontrak bernilai besar, pertimbangkan penyedia tanda tangan tersertifikasi (Privy, VIDA, dan sejenisnya).
