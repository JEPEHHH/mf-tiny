# Rencana Kerja — tiny-stack-vm-01-run-20261122

## Tujuan & Batasan
- Bangun VM stack 32-bit di `main.ts` (Node 22, TS/JS murni tanpa dependensi/WASM) untuk 40 instance (`/input/<id>/` -> `/output/<id>/stdout.bin`, `exit.txt`).
- Target: skor 1.000.000 (kalahkan baseline `plain-vm`), deterministik di 2 eksekusi, wall <= 60 detik, total ukuran repo <= 8.192 byte, ukuran `size_bytes` sekecil mungkin (tie-break).

## Rencana Kerja (Milestone)
1. **Analisis Spesifikasi & Referensi**
   - Pelajari detail urutan step, semantik opcode, dan 10 kode trap (2–11) di `program/generator/subject/ISA.md` dan `program/generator/subject/vm.mjs`.
   - Petakan seluruh edge case yang dilewatkan `baselines/plain-vm/main.ts` (`Math.imul`, `INT32_MIN / -1`, `DIVU`/`MODU`/`LTU` unsigned `>>> 0`, shift mask `& 31`, `SHR` vs `SHRU`, sign-extend `PUSH8`, `EXIT & 255`, batas stack 256, call stack 64, memori 256, step 1e6, output 65.536, `pc`/immediate out-of-bounds, `IN` EOF `-1`).
2. **Implementasi VM Inti (`main.ts`)**
   - Siapkan `LICENSE` identik dengan `starter/LICENSE` dan kerangka `main.ts` di root repo.
   - Implementasikan loop eksekusi sesuai urutan 5 langkah ISA: cek step limit (10) -> cek `pc` (9) -> decode opcode (5) -> cek batas immediate (9) -> cek stack underflow/overflow (2/3) -> eksekusi + trap spesifik (4, 6, 7, 8, 11).
   - Pastikan saat trap, output sebelumnya tetap disimpan dan instruksi yang trap tidak menulis output.
   - Commit milestone.
3. **Verifikasi & Uji Practice Set**
   - Jalankan `main.ts` pada `practice/input` dan skor dengan `program/scorer/score.ts` terhadap `practice/reference` (target 1.000.000, `passed: 1`).
   - Verifikasi determinisme (2x run identik byte-per-byte), performa (< 60 detik), dan seluruh 14 edge case.
   - Commit milestone.
4. **Optimasi Ukuran (Size-Coding) & Finalisasi**
   - Ringkas `main.ts` agar tetap 100% akurat (skor 1.000.000) dengan `size_bytes` minimal (jauh di bawah batas 8.192 byte).
   - Uji ulang dengan scorer lokal dan pastikan tidak ada berkas berlebih pada commit final.
   - Commit milestone final.

## Daftar Berkas yang Akan Dibuat
- `main.ts` — Implementasi utama tiny stack VM (entrypoint Node 22 di root repo).
- `LICENSE` — Lisensi identik dengan `starter/LICENSE` di root repo.
- `PLAN.md` — Dokumen rencana kerja ini (dihapus/tidak disertakan pada snapshot submit final jika memengaruhi batas ukuran & tie-break).
