# LeilãoTrack

Acompanha os lotes da Frazão Leilões, Portal Zuk e Mega Leilões num lugar só.
A leitura roda no GitHub a cada 2 horas e o painel fica publicado no GitHub Pages.

- Acesso: o painel pede usuário e senha. Os dados são publicados criptografados; a chave vem do segredo
  `LT_ACESSO` (formato `usuario:senha`) em **Settings › Secrets and variables › Actions**.
- Atualizar na hora: aba **Actions › Atualizar lotes › Run workflow**.
- Alertas no Telegram (opcional): em **Settings › Secrets and variables › Actions**, crie
  `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`. Os filtros do alerta ficam em `config.json`.
- O lance é sempre feito no site oficial do leiloeiro.
