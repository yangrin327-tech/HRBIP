# Supabase public root certificate

`supabase-prod-ca-2021.crt` is the public Supabase Root 2021 CA, downloaded from the **Download certificate** link in the HRBIP Supabase Database Settings on 2026-10-06.

- Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
- Expiry: 2031-04-26 10:56:53 UTC.
- This is not a private key or an account credential.

Use `sslmode=verify-full&sslrootcert=server/certs/supabase-prod-ca-2021.crt` with the PostgreSQL URL. Keep certificate and hostname verification enabled. If Supabase rotates its CA, obtain the new public certificate from its authenticated dashboard or official source and revalidate before replacing this file.
