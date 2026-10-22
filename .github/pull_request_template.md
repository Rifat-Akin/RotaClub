## RotaClub PR Özeti

- **İlgili GitHub Issue / Epic:** Closes #
- **Etkilenen Alan (Epic):**
  - [ ] #2 Altyapı, Güvenlik, Veritabanı, KVKK
  - [ ] #3 Üyelik, Giriş, Yetkilendirme (RBAC)
  - [ ] #4 Toplantılar, LCV, Kuver, Tutanak
  - [ ] #5 QR Yoklama, Make-up, Sertifikalar
  - [ ] #6 Saymanlık ve Muhasebe
  - [ ] #7 Yönetim Kurulu, Komiteler, Dönem Devri
  - [ ] #8 Projeler, Burslar, Gönüllüler
  - [ ] #9 Bildirimler ve Entegrasyonlar
  - [ ] #10 Mobil PWA, Tasarım ve Erişilebilirlik
  - [ ] #11 Çoklu Kulüp (Multi-Tenant) Genişleme

## Kabul Kriterleri & Doğrulama Kontrol Listesi

- [ ] `npm test` (birim testleri) hatasız geçti.
- [ ] `npm run lint` ve `npm run build` sıfır TypeScript/derleme hatası ile tamamlandı.
- [ ] Yetkili işlemler (Sekreter kuver yönetimi, Sayman dekont onayı, Başkan dönem/toplantı yönetimi) sunucu tarafında rol kontrolünden (`RBAC`) geçiyor.
- [ ] Kritik veri değişiklikleri `Denetim Geçmişi (Audit Log)` tablosuna kaydediliyor.
- [ ] KVKK kapsamında kişisel üye verileri açıkta loglanmadı ve `.env` gizli anahtarları repoya eklenmedi.
