# just-snake release qualification

Independent local review accepted the immutable candidate built from revision `5aafcadfe5cfc13d198b1c1ade7d9a193cf30156`. Source SHA256: `ceb78bb517b099813afc3a88fb7b08fe5aba4297741508399afedef32756f9c8`; checked-input SHA256: `4ba6c57b0690113679e262d7f078e62b20eba43cdefcb7686e51530351a72bb8`; payload-map SHA256: `b39d00061a3eda0efe487f1a87d2d6b1fdc1a8f71e31f7aca595f6c0dffedba6`. The tracked independent attestation embeds all actual case/check rows and seven payload hashes.

- Fresh native ARM64 Node 24.21.0 installs passed. All 52 local case IDs, 1,095 actual case rows, 20 static suites and 26 legacy suites passed.
- Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2 passed source, exact distribution at root, and exact distribution under /just-snake/.
- Seven distribution files total 997,618 bytes. All actual bytes match their qualified SHA256 and size. All 1,110 retained final trace archives passed CRC validation.
- Independent code review and 30 menu-state plus three production playing viewport images found no remaining release discrepancy.
- Historical failed attempts remain evidence. Corrected luma calibration and quantized native timing limits are documented in PERFORMANCE.md; emulation does not certify physical mobile devices or physical FPS.

Local qualification is complete. Hosted checks and verified live deployment remain pending authorized E05/E06 execution. Publication must use the exact checked-input and payload identity, preserve protections and custom domains, and verify served bytes before reporting success. A public deployment revision can differ from the reviewed local revision because of safe export and review/status-only commits; that difference must be recorded, never represented as the same tested commit. F01–F03 remain deferred.
