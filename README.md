# AutoCare — ELEVE TI

Aplicativo web instalável para acompanhar a manutenção e o histórico do veículo.

## Publicação

O GitHub Actions publica automaticamente o app no GitHub Pages quando há atualizações na branch `main`. A publicação leva apenas os arquivos de interface, configuração pública e assets; arquivos de desenvolvimento e banco não são enviados ao site.

## Dados e privacidade

O app usa Supabase Auth e políticas de segurança por usuário (RLS). A chave publishable do Supabase é própria para uso no navegador; credenciais administrativas nunca devem ser incluídas neste projeto.

