# LeilãoTrack

Todos os leilões. Um só lugar. Acompanha os lotes da Frazão Leilões, Portal Zuk e Mega Leilões.
Desenvolvido com IA · 2026.

- A leitura dos sites roda no GitHub a cada 2 horas, uma vez para todo o grupo.
- **Versão multiusuário** (pasta `site/novo/`): login por convite, favoritos, alertas e Top 15 por pessoa,
  perícia com a chave de IA de cada um. Banco no Supabase com regras de acesso por linha (`supabase/schema.sql`).
  Passo a passo de instalação em `GUIA-LEILAOTRACK.txt`.
- Versão anterior (raiz de `site/`): acesso com senha única, dados criptografados. Continua no ar até a troca.
- Atualizar na hora: aba **Actions › Atualizar lotes › Run workflow**.
- O lance é sempre feito no site oficial do leiloeiro. Ferramenta de triagem, não recomendação de investimento.
